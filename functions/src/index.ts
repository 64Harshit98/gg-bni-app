// // functions/src/index.ts
// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';
// import express, { Request, Response } from 'express'; // Correct import for express and types
// import cors from 'cors'; // Correct import for cors
// import 
// // Initialize Firebase Admin SDK
// admin.initializeApp();

// const app = express();

// // Use CORS to allow your frontend to make requests to this Cloud Function.
// // IMPORTANT: For production, restrict origins to your specific frontend domain(s)
// app.use(cors({ origin: true })); // For development, origin: true is fine. For production, specify domains.
// app.use(express.json()); // Enable JSON body parsing

// // Define an interface for the expected request body
// interface AddItemRequestBody {
//   itemData: {
//     name: string;
//     price: number;
//     category: string;
//     tax: number;
//     purchasePrice: number;
//     discount: number;
//     // Add other fields from your ItemData interface if needed
//   };
//   userId: string;
// }

// // Define an API endpoint for adding items
// // Use explicit types for Request and Response for better type checking
// app.post('/addItem', async (req: Request, res: Response) => {
//   // Cast the request body to our defined interface for type safety
//   const { itemData, userId } = req.body as AddItemRequestBody;

//   try {
//     // Basic validation
//     if (!itemData || !userId || !itemData.name || itemData.price === undefined) {
//       functions.logger.warn('Missing item data or user ID in request.', { itemData, userId });
//       return res.status(400).send({ error: 'Missing item data or user ID.' });
//     }

//     // More robust server-side validation for itemData fields
//     if (typeof itemData.name !== 'string' || itemData.name.trim() === '') {
//         return res.status(400).send({ error: 'Item name is required and must be a string.' });
//     }
//     if (typeof itemData.price !== 'number' || itemData.price <= 0) {
//         return res.status(400).send({ error: 'Item price must be a positive number.' });
//     }
//     if (typeof itemData.category !== 'string' || itemData.category.trim() === '') {
//         return res.status(400).send({ error: 'Item category is required and must be a string.' });
//     }
//     if (typeof itemData.tax !== 'number' || itemData.tax < 0) {
//         return res.status(400).send({ error: 'Item tax must be a non-negative number.' });
//     }
//     if (typeof itemData.purchasePrice !== 'number' || itemData.purchasePrice <= 0) {
//         return res.status(400).send({ error: 'Item purchase price must be a positive number.' });
//     }
//     if (typeof itemData.discount !== 'number' || itemData.discount < 0) {
//         return res.status(400).send({ error: 'Item discount must be a non-negative number.' });
//     }


//     const db = admin.firestore();

//     // Define the collection path for private user data
//     // functions.config().app.id is used to get the app ID from Firebase config,
//     // which you set via `firebase functions:config:set app.id="your-app-id"`
//     const itemsCollectionRef = db.collection(`artifacts/${functions.config().app.id}/users/${userId}/items`);

//     // Add the item document to Firestore using the admin SDK
//     const docRef = await itemsCollectionRef.add({
//       ...itemData,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(), // Use server timestamp for accuracy
//       userId: userId, // Store the user ID for ownership/filtering
//     });

//     // Send a success response
//     return res.status(201).send({ message: 'Item added successfully!', itemId: docRef.id });
// 1
//   } catch (error: any) {
//     // Log the error for debugging purposes in Cloud Functions logs
//     functions.logger.error('Error adding item in Cloud Function:', error);
//     return res.status(500).send({ error: 'Failed to add item.', details: error.message });
//   }
// });

// // Expose the Express app as an HTTP Cloud Function
// // The name 'api' will determine the URL, e.g., https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/api
// exports.api = functions.https.onRequest(app);
