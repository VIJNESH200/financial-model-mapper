# Sample Financial Models

A bundled sample workbook is provided directly in this directory for immediate testing:
- **`sample_financial_model.xlsx`**: A three-statement financial model workbook containing:
  - **`IS` (Income Statement)**: 12 line items covering historical matches (Net Sales, Cost of Goods Sold, EBITDA, Operating Expenses), taxonomy alias matches (Research & Development, SG&A, Interest Expense, Income Tax Expense), and unmapped items (Foreign Exchange Gain/Loss).
  - **`BS` (Balance Sheet)**: 13 line items covering assets, liabilities, and equity (Cash and Cash Equivalents, Accounts Receivable, Inventories, PPE, Accounts Payable, Long-Term Debt, Retained Earnings).
  - **`CF` (Cash Flow Statement)**: 7 line items covering operating, investing, and financing cash flows (Cash from Operations, CapEx, Cash from Investing, Cash from Financing, Net Change in Cash).

To test with additional models, do not commit real or confidential client data to this repository. You can obtain or generate safe sample financial models from:
1. Public financial model templates from corporate finance educational portals (e.g., Macabacus, CFI, or Wall Street Prep free template libraries).
2. Public SEC 10-K / 10-Q financial statement data exports from EDGAR.
3. Creating a standard workbook in Microsoft Excel or Google Sheets with sheets named `IS`, `BS`, or `CF` and saving as `.xlsx` or `.xlsm`.
