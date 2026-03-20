import sqlite3
import pandas as pd
import os

pd.set_option('display.max_rows', None)
pd.set_option('display.width', 1000)

EOS_DB = 'eos-telegram-bot/data/eos.db'
IQ_DB = 'eos-iq-bot/data/eos-iq.db'

def run_checks(db_path, db_name):
    print(f"\n{'='*20} {db_name} ({db_path}) {'='*20}")
    if not os.path.exists(db_path):
        print("❌ File not found.")
        return

    conn = sqlite3.connect(db_path)
    
    try:
        # A. Diversidade e Contaminação
        print("\n--- A. DIVERSITY & CONTAMINATION ---")
        
        # 1. Total Rows
        try:
            total = conn.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
            print(f"Total Rows: {total}")
        except:
             print("Table 'signals' not found or empty.")
             return

        # 2. Unique Symbols
        # Note: eos-iq uses 'pair' instead of 'symbol' usually. Let's check schema first implicitly or handle error.
        try:
            col_name = 'symbol'
            # Check if symbol exists, if not try pair
            cols = [i[1] for i in conn.execute("PRAGMA table_info(signals)")]
            if 'symbol' not in cols and 'pair' in cols:
                col_name = 'pair'
            
            uniq = conn.execute(f"SELECT COUNT(DISTINCT {col_name}) FROM signals").fetchone()[0]
            print(f"Unique Symbols: {uniq}")
            
            # 3. Asset Type Distribution
            # Asset type might not exist in IQ yet?
            if 'asset_type' in cols:
                print("\nAsset Type Distribution:")
                print(pd.read_sql_query("SELECT asset_type, COUNT(*) as n FROM signals GROUP BY asset_type ORDER BY n DESC", conn))
            elif 'assettype' in cols:
                 print("\nAsset Type Distribution:")
                 print(pd.read_sql_query("SELECT assettype, COUNT(*) as n FROM signals GROUP BY assettype ORDER BY n DESC", conn))
            else:
                print(f"\n⚠️ Column 'asset_type' not found. (Cols: {cols})")

            # 4. Top 20 Symbols
            print("\nTop 20 Symbols:")
            print(pd.read_sql_query(f"SELECT {col_name}, COUNT(*) as n FROM signals GROUP BY {col_name} ORDER BY n DESC LIMIT 20", conn))
            
        except Exception as e:
            print(f"Error querying symbols: {e}")

        # B. Schema
        print("\n--- B. SCHEMA (PRAGMA table_info) ---")
        schema = pd.read_sql_query("PRAGMA table_info(signals)", conn)
        print(schema[['cid', 'name', 'type', 'notnull', 'dflt_value']].to_string(index=False))
        
        # Check specific expected columns
        expected_cols = [
            'symbol', 'timestamp', 'created_at', 'entry_price', 'entryprice', 'exit_price', 'exitprice', 
            'direction', 'action', 'result', 'pnl', 'mfe', 'mae', 'volume', 'vwap',
            'location_va', 'locationva', 'distance_vwap_std', 'distancevwapstd', 
            'effort_result_ratio', 'effortresultratio', 'is_absorption', 'isabsorption', 
            'volatility_regime', 'volatilityregime', 'setup_type', 'setuptype', 
            'asset_type', 'assettype'
        ]
        
        found_cols = schema['name'].tolist()
        missing = [c for c in expected_cols if c not in found_cols]
        # Some are aliases (entry_price vs entryprice), so this is just for info
        # print(f"\nCols from checklist NOT found (checking aliases...): {missing}")

    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    import sys
    with open('db_audit_report.txt', 'w', encoding='utf-8') as f:
        sys.stdout = f
        run_checks(EOS_DB, "EOS PROD DB")
        sys.stdout = sys.__stdout__
    print("Report generated: db_audit_report.txt")
