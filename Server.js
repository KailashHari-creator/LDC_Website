// const express = require('express');
// const http = require("http");
// const session = require("express-session");
// const { Server } = require("socket.io");
// const path = require("path");
// const multer = require("multer");
// const sharedSession = require("express-socket.io-session");
// require('dotenv').config();
// const ejs = require('ejs');
// const fs = require("fs");

// const app = express();
// const PORT = process.env.PORT || 3000;
// const server = http.createServer(app);
// const io = new Server(server);

// // View Engine
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));
// const avatarPath = path.join(__dirname, "public", "avatars");
// if (!fs.existsSync(avatarPath)) {
//   fs.mkdirSync(avatarPath, { recursive: true });
// }

// // Static & Middleware
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(express.static('public'));

// // Session Middleware
// const sessionMiddleware = session({
//   secret: "ldc_chat_secret",
//   resave: false,
//   saveUninitialized: true,
// });
// app.use(sessionMiddleware);
// io.use(sharedSession(sessionMiddleware, { autoSave: true }));

// // Multer storage for avatar uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, './public/avatars/'),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     const username = req.body.username || 'user';
//     cb(null, username + '-' + Date.now() + ext);
//   }
// });
// const upload = multer({ storage });

// // Track online users
// const onlineUsers = new Map();

// // ROUTES
// app.get("/", (req, res) => res.render("index"));

// app.get("/signup", (req, res) => res.render("signup"));

// app.post("/signup", upload.single("avatar"), (req, res) => {
//   const { username } = req.body;
//   if (!username || !req.file) return res.redirect("/signup");

//   req.session.username = username;
//   req.session.avatar = "/avatars/" + req.file.filename;
//   res.redirect("/Gang_Chat");
// });

// app.get("/login", (req, res) => res.render("login"));

// app.post("/login", (req, res) => {
//   const username = req.body.username;
//   if (!username) return res.redirect("/login");

//   req.session.username = username;
//   req.session.avatar = "/avatars/default.png"; // default avatar
//   res.redirect("/Gang_Chat");
// });

// app.get("/logout", (req, res) => {
//   req.session.destroy(() => {
//     res.redirect("/login");
//   });
// });

// app.get("/contacts", (req, res) => res.render("Contacts"));

// app.get("/Gang_Chat", (req, res) => {
//   if (!req.session.username) return res.redirect("/login");

//   res.render("Gang_Chat", {
//     username: req.session.username,
//     avatar: req.session.avatar,
//     onlineUsers: Array.from(onlineUsers.values())
//   });
// });

// // SOCKET.IO
// io.on("connection", (socket) => {
//   const session = socket.handshake.session;
//   const username = session.username;
//   const avatar = session.avatar;

//   if (!username) {
//     socket.disconnect(true);
//     return;
//   }

//   // Add to online users
//   onlineUsers.set(socket.id, { username, avatar });

//   // Broadcast updated list
//   io.emit("updateUsers", Array.from(onlineUsers.values()));

//   console.log(`🟢 ${username} connected`);

//   // Chat message handler
//   socket.on("chat message", (msg) => {
//     io.emit("chat message", { user: username, avatar, text: msg });
//   });

//   // On disconnect
//   socket.on("disconnect", () => {
//     console.log(`🔴 ${username} disconnected`);
//     onlineUsers.delete(socket.id);
//     io.emit("updateUsers", Array.from(onlineUsers.values()));
//   });
// });

// server.listen(PORT, () => {
//   console.log(`✅ LDC Chat running at http://localhost:${PORT}`);
// });
const express = require('express');
const http = require("http");
const session = require("express-session");
const { Server } = require("socket.io");
const path = require("path");
const sharedSession = require("express-socket.io-session");
const fileUpload = require("express-fileupload");
require('dotenv').config();
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL setup
const db = new Pool({
  connectionString: process.env.DATABASE_URL, // e.g., postgres://user:pass@localhost:5432/ldc_chat
});
console.log("✅ Connected to PostgreSQL database ",db);

// View engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static('public'));
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));

const sessionMiddleware = session({
  secret: "ldc_chat_secret",
  resave: false,
  saveUninitialized: true,
});

app.use(sessionMiddleware);

const server = http.createServer(app);
const io = new Server(server);
io.use(sharedSession(sessionMiddleware, { autoSave: true }));

// Routes
app.get('/', (req, res) => {
  res.render("index");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const username = req.body.username;
  if (!username) return res.redirect("/login");

  const user = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  if (!user.rows.length) return res.redirect("/signup");

  req.session.username = username;
  await db.query('UPDATE users SET is_online = true WHERE username = $1', [username]);
  res.redirect("/Gang_Chat");
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post("/signup", async (req, res) => {
  const username = req.body.username;
  const avatar = req.files?.avatar;

  if (!username || !avatar) return res.status(400).send("Missing data");

  const avatarPath = `/avatars/${username}-${Date.now()}.${avatar.name.split('.').pop()}`;
  await avatar.mv(__dirname + '/public' + avatarPath);

  try {
    await db.query('INSERT INTO users (username, avatar) VALUES ($1, $2)', [username, avatarPath]);
    req.session.username = username;
    res.redirect("/Gang_Chat");
  } catch (err) {
    res.status(500).send(`User already exists or DB error ${err}`);
  }
});

app.get('/Gang_Chat', async (req, res) => {
  if (!req.session.username) return res.redirect('/login');

  const user = await db.query('SELECT * FROM users WHERE username = $1', [req.session.username]);
  res.render('Gang_Chat', {
    username: req.session.username,
    avatar: user.rows[0].avatar || '/avatars/default.png',
  });
});

app.get("/logout", async (req, res) => {
  if (req.session.username) {
    await db.query('UPDATE users SET is_online = false WHERE username = $1', [req.session.username]);
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/contacts', async (req, res) => {
    res.render('Contacts');
});

io.on("connection", async (socket) => {
  const username = socket.handshake.session.username;
  if (!username) {
    socket.disconnect();
    return;
  }

  const users = await db.query('SELECT username, avatar FROM users WHERE is_online = true');
  io.emit("updateUsers", users.rows);

  socket.on("chat message", async (msg) => {
  const userRes = await db.query('SELECT avatar FROM users WHERE username = $1', [username]);
  const avatar = userRes.rows[0]?.avatar || '/avatars/default.png';

  io.emit("chat message", {
    user: username,
    avatar: avatar,
    text: msg,
  });
});


  socket.on("disconnect", async () => {
    await db.query('UPDATE users SET is_online = false WHERE username = $1', [username]);
    const users = await db.query('SELECT username, avatar FROM users WHERE is_online = true');
    io.emit("update users", users.rows);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
