import os
import requests
import json

from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://ymckairbwictbfsfpqzt.supabase.co")
# The service role key has bypass RLS privileges, used safely in localhost scripts
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_KEY:
    print("Error: SUPABASE_SERVICE_ROLE_KEY environment variable is not set in .env.local")
    exit(1)

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# Mapping of product names to success URLs
product_updates = {
    "Ultimate LLM Context Database": "https://drive.google.com/drive/folders/1MF0xhcGp3GI7CJhj9TcotxLex_rahkWu?usp=drive_link",
    "Relationship Framework": "https://drive.google.com/file/d/1-6uy8R2He4AdnFl0XRyhw6rexAJg6IHk/view?usp=sharing",
    "Conversation Framework": "https://drive.google.com/file/d/1dPa1YevKXko52a2CY8VvB38DKUr9uFp9/view?usp=sharing",
    "Framework of Reality": "https://drive.google.com/file/d/1fWk7e-_kGfuAsdkRerLarMwsMEf6iE1u/view?usp=sharing",
    "Purpose Guide": "https://drive.google.com/file/d/1fRA7_xIrCw0XtOORljA3crcdSOCdFx3M/view?usp=sharing"
}

def update_products():
    print("Fetching products...")
    response = requests.get(f"{SUPABASE_URL}/rest/v1/products?select=id,name", headers=headers)
    
    if response.status_code != 200:
        print(f"Error fetching: {response.text}")
        return
        
    products = response.json()
    
    for product in products:
        name = product.get("name")
        product_id = product.get("id")
        
        if name in product_updates:
            success_url = product_updates[name]
            print(f"Updating {name} ({product_id})...")
            
            update_res = requests.patch(
                f"{SUPABASE_URL}/rest/v1/products?id=eq.{product_id}",
                headers=headers,
                json={"success_url": success_url}
            )
            
            if update_res.status_code in [200, 204]:
                print(f"  -> Successfully updated.")
            else:
                print(f"  -> Failed: {update_res.text}")

if __name__ == "__main__":
    update_products()
