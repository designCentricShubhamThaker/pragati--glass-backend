import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import orderRoutes from './routes/orderRoutes.js';
import './config/db.js'; 


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
})); 

const PORT = process.env.PORT || 5000;

app.use('/orders', orderRoutes);

app.get('/', (req, res) => {
  res.send('✅ Pragati Glass Order Management API is Running!');
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const connectedUsers = {
  dispatchers: new Map(),
  teams: {
    glass: new Map(),
    caps: new Map(),
    box: new Map(),
    pump: new Map()
  }
};

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  
  // Handle user registration
  socket.on('register', (userData) => {
    const { userId, role, team } = userData;
    
    console.log(`📝 User registered:(${role}${team ? ', ' + team : ''})`);
    
    const userInfo = { socketId: socket.id, userId, role, team, connected: true };
    
    // Register in appropriate category
    if (role === 'admin' || role === 'dispatcher') {
      connectedUsers.dispatchers.set(userId, userInfo);
      socket.join('dispatchers');
    } else if (team) {
      if (connectedUsers.teams[team]) {
        connectedUsers.teams[team].set(userId, userInfo);
        socket.join(team);
      }
    }
    // Send connection acknowledgment
    socket.emit('registered', { success: true });
    
    // Broadcast updated user lists
    emitConnectedUsers();
  });

  // Ping to check connection
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ time: new Date().toISOString() });
    }
  });
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    // Find and remove the disconnected user
    let userRemoved = false;

    // Check dispatchers
    for (const [userId, info] of connectedUsers.dispatchers.entries()) {
      if (info.socketId === socket.id) {
        connectedUsers.dispatchers.delete(userId);
        userRemoved = true;
        break;
      }
    }
    // Check teams
    if (!userRemoved) {
      for (const team of Object.keys(connectedUsers.teams)) {
        for (const [userId, info] of connectedUsers.teams[team].entries()) {
          if (info.socketId === socket.id) {
            connectedUsers.teams[team].delete(userId);
            userRemoved = true;
            break;
          }
        }
        if (userRemoved) break;
      }
    }
    
    // Broadcast updated user lists
    emitConnectedUsers();
  });
  
  function emitConnectedUsers() {
    // Prepare data for dispatchers
    const dispatchersList = Array.from(connectedUsers.dispatchers.values()).map(u => ({
      userId: u.userId,
     
      connected: true,
      lastActive: new Date().toISOString()
    }));
    
    // Prepare data for teams
    const teamLists = {};
    const allTeamMembers = [];
    
    for (const [teamName, users] of Object.entries(connectedUsers.teams)) {
      const teamUsers = Array.from(users.values()).map(u => ({
        userId: u.userId,
       
        team: teamName,
        connected: true,
        lastActive: new Date().toISOString()
      }));
      
      teamLists[teamName] = teamUsers;
      allTeamMembers.push(...teamUsers);
    }
    
    // Send to dispatchers - include both structures for flexibility
    io.to('dispatchers').emit('connected-users', {
      dispatchers: dispatchersList,
      teamMembers: allTeamMembers,
      teams: teamLists
    });
    
    // Send to each team (only their own team members + dispatchers)
    for (const teamName of Object.keys(connectedUsers.teams)) {
      io.to(teamName).emit('connected-users', {
        dispatchers: dispatchersList,
        teamMembers: teamLists[teamName] || []
      });
    }
  }


  socket.on('order-update', (data) => {
    const { order, teamType, timestamp } = data;
    console.log(`📦 Order update received from ${teamType}: Order #${order.order_number}`);
    
    // Store user info for logging
    const user = findUserBySocketId(socket.id);

    
    // Broadcast to all dispatchers
    console.log(`📢 Broadcasting order update to dispatchers`);
    io.to('dispatchers').emit('order-updated', {
      ...order,
      _meta: {
        updatedBy: user,
        teamType,
        timestamp
      }
    });
    
    // Send acknowledgment to sender
    socket.emit('order-update-confirmed', {
      orderId: order._id,
      status: 'delivered',
      timestamp: new Date().toISOString()
    });
  });
  
  // Helper function to find user by socket ID
  function findUserBySocketId(socketId) {
    // Check dispatchers
    for (const user of connectedUsers.dispatchers.values()) {
      if (user.socketId === socketId) {
        return user;
      }
    }
    
    // Check team members
    for (const team of Object.values(connectedUsers.teams)) {
      for (const user of team.values()) {
        if (user.socketId === socketId) {
          return user;
        }
      }
    }
    
    return null;
  }
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.io server initialized`);
});

export { io, httpServer };

