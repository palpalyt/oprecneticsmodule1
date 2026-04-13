const express = require('express');
const app = express();
const PORT = 8080;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    nama: "Kenzie Maheswara",
    nrp: "5025241001",
    status: "UP",
    timestamp: Date.now(),
    uptime: process.uptime(),
    message: "Server is healthy hi"
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});