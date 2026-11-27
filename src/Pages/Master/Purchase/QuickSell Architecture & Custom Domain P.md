QuickSell Architecture & Custom Domain Provisioning

QuickSell is a mobile-first SaaS platform that enables small-to-medium businesses (SMBs) and B2B sellers to create, manage, and share digital product catalogues. To host thousands of unique business storefronts from a single unified codebase, the platform relies on a highly scalable multi-tenant cloud architecture.

Below is a breakdown of how the platform handles multi-tenant custom domain provisioning, its overarching site architecture, and its primary technology stack.

1. Custom Domain & Catalogue Provisioning Architecture

When an e-commerce SaaS platform allows merchants to host catalogues on custom domains (e.g., shop.merchantdomain.com) or subdomains, it must automate the routing and security without requiring manual server configuration for every new user. This is achieved through a dynamic provisioning pipeline:

DNS Routing & Wildcards: For standard platform subdomains, a wildcard DNS record (e.g., *.quicksell.co) points to the main load balancer. When a merchant links their own custom domain, they add a CNAME record in their DNS provider pointing to the platform's ingress server (e.g., shops.quicksell.co).

Dynamic SSL Termination: Because modern browsers mandate HTTPS, the platform issues SSL certificates for user domains on the fly. This is usually handled via edge services like Cloudflare SSL for SaaS or an automated ACME protocol (like Let's Encrypt with Kubernetes Cert-Manager). The edge network automatically provisions and terminates the SSL certificate upon a new domain's first access.

Tenant Resolution (The Host Header): When a buyer accesses a catalogue, the HTTP request hits the platform's reverse proxy (e.g., Nginx, HAProxy, Envoy). The proxy inspects the HTTP Host header to see which domain was requested.

Domain-to-Tenant Mapping: The request passes to a Tenant Resolution Middleware. This service queries a high-speed in-memory data store (like Redis) to map the incoming domain (shop.merchantdomain.com) to a specific internal tena nt identifier (e.g., tenant_id: 8492).

Data Isolation: Once resolved, the tenant_id is appended to the request payload and forwarded to the backend microservices. The backend strictly uses this ID to fetch the correct products, themes, layouts, and privacy settings for that specific merchant, ensuring data isolation.

2. Platform Technology Stack

High-scale quick-commerce platforms utilize modern, JavaScript-heavy stacks to ensure speed and cross-platform compatibility:

Mobile Apps (Merchant Dashboard): Built primarily using React Native. This single-codebase approach allows rapid deployment across iOS and Android while leveraging device-native APIs for camera access (product scanning/photography), local storage, and push notifications.

Web Frontend (Catalogue Viewer): The buyer-facing storefronts are developed using frameworks like React.js or Next.js. Server-Side Rendering (SSR) is essential here to ensure search engine web crawlers can index product metadata (SEO) and that the catalogue loads almost instantly on slow mobile connections.

Backend Microservices: The backend is typically built with high-concurrency languages like Node.js or Go, broken into specialized microservices:

Catalogue Service: Manages UI layouts (Grid vs. List), banners, and branding.

Inventory & Pricing Service: Handles complex variant-based catalogs (colors, sizes) and customized pricing logic.

Privacy Service: Manages OTP verification, gated buyer access, and real-time screenshot protection.

Database Architecture: Platforms use a "Shared Database, Shared Schema" multi-tenancy model. All data resides in massive relational tables (e.g., PostgreSQL or MySQL), but every single row has a strictly enforced tenant_id column. Document databases (MongoDB) may be used alongside to store highly unstructured product specifications.

Caching & Real-Time Events: Redis is utilized for caching domain mappings and high-traffic catalogues. Event streaming platforms like Kafka or RabbitMQ handle real-time triggers, such as sending a "Catalogue Opened" push notification to a merchant the moment a buyer clicks their link.

3. Infrastructure and Media Handling

Content Delivery Network (CDN): Digital catalogues are highly visual. Uploaded product images are stored in scalable object storage (like AWS S3). A CDN (e.g., Cloudflare, AWS CloudFront) caches these assets at global edge servers, ensuring rapid loading regardless of the buyer's geographical location.

Asynchronous Image Processing: Immediately upon upload, background worker queues trigger serverless functions (e.g., AWS Lambda). These functions strip EXIF data, compress the media, and generate multiple responsive thumbnail sizes optimized for different UI layouts, preventing mobile apps from downloading heavy source files.