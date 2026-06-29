# Smart Commerce AI + Custom POS Platform Blueprint

## Product Split

Smart Commerce AI is the customer-facing commerce platform.

Custom POS is the back-office operating system.

SellSync connects customer conversations to the commerce platform.

## System Ownership

### Custom POS owns:
- products
- categories
- brands
- pricing
- inventory
- branches
- customers
- sales
- quotes
- rentals
- repairs
- suppliers
- purchase orders
- staff
- reports

### Smart Commerce AI owns:
- public website
- AI search
- product match
- customer cart
- rental booking
- repair booking
- customer signup
- commercial requests
- customer portal
- product discovery experience

### SellSync owns:
- WhatsApp conversations
- Instagram conversations
- AI sales assistance
- quote conversations
- customer follow-up
- conversational commerce workflows

## Data Flow

Customer uses Smart Commerce AI.

Smart Commerce AI sends requests to the Commerce API.

Commerce API communicates with Custom POS.

Custom POS returns live products, prices, stock, rentals, repairs, and customer data.

## Core Rule

No hardcoded product, inventory, rental, repair, or customer data in the frontend.

The frontend must request all business data through the platform API.

## Main Modules

### Smart Commerce AI
1. Homepage
2. Product catalog
3. AI search
4. Product match
5. Cart
6. Rental booking
7. Repair booking
8. Commercial quote request
9. Customer portal
10. Account signup/login

### Custom POS
1. Products
2. Inventory
3. Branches
4. Sales
5. Quotes
6. Rentals
7. Repairs
8. Customers
9. Suppliers
10. Purchase orders
11. Staff and roles
12. Reports

### Shared Platform API
1. Products API
2. Inventory API
3. Customer API
4. Cart/request API
5. Rental API
6. Repair API
7. Product Match API
8. AI Search API
9. Commercial Request API

## Development Order

### Phase 1
Define shared contracts and API routes.

### Phase 2
Create backend API skeleton.

### Phase 3
Connect frontend to API client.

### Phase 4
Build Custom POS data models.

### Phase 5
Build real customer workflows.

### Phase 6
Connect AI assistant to real catalog data.

### Phase 7
Connect SellSync to the same commerce API.

## Non-Negotiables

- No fake inventory in production code.
- No frontend-only business logic.
- No direct POS database access from frontend.
- No hardcoded branch counts.
- No duplicated product data.
- No dead buttons.
- No isolated demo flows.

## Target

Smart Commerce AI should become a real platform where customers can shop, rent, repair, match products by image, ask AI, and submit real business requests connected to the Custom POS.