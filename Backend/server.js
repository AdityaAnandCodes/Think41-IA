const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL database"))
  .catch((err) => console.error("❌ Database connection error:", err));

// Helper function to validate customer ID
const isValidId = (id) => {
  return !isNaN(id) && parseInt(id) > 0;
};

// API Routes

// 1. GET /customers - List all customers with pagination
app.get("/customers", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata
    const countQuery = "SELECT COUNT(*) FROM users";
    const countResult = await pool.query(countQuery);
    const totalCustomers = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCustomers / limit);

    // Get customers with order count
    const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.age,
        u.gender,
        u.state,
        u.city,
        u.country,
        u.traffic_source,
        u.created_at,
        COUNT(o.order_id) as order_count
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.age, u.gender, u.state, u.city, u.country, u.traffic_source, u.created_at
      ORDER BY u.id
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    res.json({
      success: true,
      data: {
        customers: result.rows,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_customers: totalCustomers,
          per_page: limit,
          has_next_page: page < totalPages,
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to fetch customers",
    });
  }
});

// 2. GET /customers/:id - Get specific customer details with order count
app.get("/customers/:id", async (req, res) => {
  try {
    const customerId = req.params.id;

    // Validate customer ID
    if (!isValidId(customerId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid customer ID",
        message: "Customer ID must be a positive integer",
      });
    }

    // Get customer details with order statistics
    const query = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.age,
        u.gender,
        u.state,
        u.street_address,
        u.postal_code,
        u.city,
        u.country,
        u.latitude,
        u.longitude,
        u.traffic_source,
        u.created_at,
        COUNT(o.order_id) as order_count,
        COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN o.status = 'returned' THEN 1 END) as returned_orders,
        COALESCE(SUM(o.num_of_item), 0) as total_items_ordered,
        MAX(o.created_at) as last_order_date,
        MIN(o.created_at) as first_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.id = $1
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.age, u.gender, u.state, u.street_address, u.postal_code, u.city, u.country, u.latitude, u.longitude, u.traffic_source, u.created_at
    `;

    const result = await pool.query(query, [customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
        message: `Customer with ID ${customerId} does not exist`,
      });
    }

    // Format the response
    const customer = result.rows[0];
    const formattedCustomer = {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      full_name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email,
      age: customer.age,
      gender: customer.gender,
      location: {
        state: customer.state,
        city: customer.city,
        country: customer.country,
        street_address: customer.street_address,
        postal_code: customer.postal_code,
        latitude: customer.latitude,
        longitude: customer.longitude,
      },
      traffic_source: customer.traffic_source,
      created_at: customer.created_at,
      order_statistics: {
        total_orders: parseInt(customer.order_count),
        delivered_orders: parseInt(customer.delivered_orders),
        returned_orders: parseInt(customer.returned_orders),
        total_items_ordered: parseInt(customer.total_items_ordered),
        first_order_date: customer.first_order_date,
        last_order_date: customer.last_order_date,
      },
    };

    res.json({
      success: true,
      data: {
        customer: formattedCustomer,
      },
    });
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to fetch customer details",
    });
  }
});

// 3. GET /customers/:id/orders - Get all orders for a specific customer
app.get("/customers/:id/orders", async (req, res) => {
  try {
    const customerId = req.params.id;

    // Validate customer ID
    if (!isValidId(customerId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid customer ID",
        message: "Customer ID must be a positive integer",
      });
    }

    // Check if customer exists
    const customerCheck = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [customerId]
    );
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
        message: `Customer with ID ${customerId} does not exist`,
      });
    }

    // Get customer's orders
    const query = `
      SELECT 
        order_id,
        status,
        num_of_item,
        created_at,
        shipped_at,
        delivered_at,
        returned_at
      FROM orders 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [customerId]);

    res.json({
      success: true,
      data: {
        customer_id: parseInt(customerId),
        orders: result.rows.map((order) => ({
          order_id: order.order_id,
          status: order.status,
          num_of_item: order.num_of_item,
          created_at: order.created_at,
          shipped_at: order.shipped_at,
          delivered_at: order.delivered_at,
          returned_at: order.returned_at,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching customer orders:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to fetch customer orders",
    });
  }
});

// 4. GET /stats - Get overall statistics
app.get("/stats", async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM users) as total_customers,
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COALESCE(AVG(num_of_item), 0) FROM orders) as average_items_per_order,
        (SELECT COALESCE(SUM(num_of_item), 0) FROM orders) as total_items_sold,
        (SELECT COUNT(*) FROM orders WHERE status = 'delivered') as delivered_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'returned') as returned_orders,
        (SELECT COUNT(DISTINCT traffic_source) FROM users) as unique_traffic_sources
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        statistics: {
          total_customers: parseInt(stats.total_customers),
          total_orders: parseInt(stats.total_orders),
          average_items_per_order: parseFloat(
            stats.average_items_per_order
          ).toFixed(2),
          total_items_sold: parseInt(stats.total_items_sold),
          delivered_orders: parseInt(stats.delivered_orders),
          returned_orders: parseInt(stats.returned_orders),
          unique_traffic_sources: parseInt(stats.unique_traffic_sources),
          delivery_rate:
            stats.total_orders > 0
              ? ((stats.delivered_orders / stats.total_orders) * 100).toFixed(
                  2
                ) + "%"
              : "0%",
          return_rate:
            stats.total_orders > 0
              ? ((stats.returned_orders / stats.total_orders) * 100).toFixed(
                  2
                ) + "%"
              : "0%",
        },
      },
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to fetch statistics",
    });
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      success: true,
      message: "API is healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// 404 handler for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: "An unexpected error occurred",
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Customer API server running on port ${port}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /customers - List all customers (with pagination)`);
  console.log(`   GET  /customers/:id - Get customer details`);
  console.log(`   GET  /customers/:id/orders - Get customer orders`);
  console.log(`   GET  /stats - Get overall statistics`);
});

module.exports = app;
