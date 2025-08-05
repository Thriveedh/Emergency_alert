const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

const users = {};  // Stores user data: { user_id: { name, role, latitude, longitude, socketId } }

// Calculate distance between two geo points in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const toRad = x => x * Math.PI / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

io.on('connection', (socket) => {
    const user_id = socket.handshake.query.user_id;
    if (user_id) {
        if (!users[user_id]) {
            users[user_id] = {};
        }
        users[user_id].socketId = socket.id;
        console.log(`User connected: ${user_id}`);
    }

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${user_id}`);
        // Optionally remove or mark offline
    });
});

// Register endpoint
app.post('/register', (req, res) => {
    const { user_id, name, role, latitude, longitude } = req.body;
    users[user_id] = {
        name,
        role,
        latitude,
        longitude,
        socketId: users[user_id]?.socketId || null
    };
    res.json({ message: 'User registered', user_id });
});

// Send alert from ambulance to nearby drivers
app.post('/send_alert', (req, res) => {
    const { user_id } = req.body;
    const ambulance = users[user_id];
    if (!ambulance || ambulance.role !== 'ambulance_driver') {
        return res.status(400).json({ error: 'Invalid ambulance' });
    }

    const alertsSent = [];

    for (const [id, user] of Object.entries(users)) {
        if (user.role === 'normal_driver') {
            const distance = calculateDistance(
                ambulance.latitude, ambulance.longitude,
                user.latitude, user.longitude
            );

            if (distance < 200 && user.socketId) {
                io.to(user.socketId).emit('ambulance_alert', { distance });
                alertsSent.push(id);
            }
        }
    }

    res.json({ message: 'Alert processed', alertsSent });
});

server.listen(5000, () => {
    console.log('Server listening on http://localhost:5000');
});
