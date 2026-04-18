import express from 'express';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8080;

// process.cwd() ensures it always looks in the absolute root of your cloud container
const distPath = path.join(process.cwd(), 'dist');

// 1. Serve the static files from the Vite build folder
app.use(express.static(distPath));

// 2. Catch-all route to hand routing back to React (React Router)
app.get('/*splat', (req, res, next) => {
    // DEBUG/CACHE FIX: If the browser asks for a specific asset (like .js, .css, or .png)
    // and it wasn't found in the dist folder, return a 404 error instead of the HTML page.
    if (req.path.includes('.')) {
        return res.status(404).send('Asset not found. Please do a hard refresh.');
    }

    // Otherwise, it's a standard page navigation, so serve the React app
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});