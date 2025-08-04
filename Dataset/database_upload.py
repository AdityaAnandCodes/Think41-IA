import os
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Step 1: Load your CSVs
users_df = pd.read_csv("./users.csv")
orders_df = pd.read_csv("./orders.csv")

# Step 2: Read credentials from .env
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")
host = os.getenv("DB_HOST")
port = os.getenv("DB_PORT")
database = os.getenv("DB_NAME")

# Step 3: Create SQLAlchemy connection engine
db_url = f"postgresql://{user}:{password}@{host}:{port}/{database}"
engine = create_engine(db_url)

# Step 4: Upload the data
users_df.to_sql("users", engine, if_exists="append", index=False)
orders_df.to_sql("orders", engine, if_exists="append", index=False)

print("CSV upload complete ✅")
