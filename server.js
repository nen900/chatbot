

const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");
const http = require('http');
const mongoose = require("mongoose");
const express = require("express");
const path = require("path");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const axios =  require("axios");
require("dotenv").config();

const fs = require("fs");
let menu = {};
try {
  menu = JSON.parse(fs.readFileSync(path.join(__dirname, "menu.json")));
} catch (err) {
  console.error("Failed to read menu.json:", err);
}

const { User } = require("./userchema");

const io = new Server(server, {
  cors: { origin: "*" }
});

const users = {};
const cur_orders = {};

app.use(express.static(path.join(__dirname, "public")));

app.use(cookieParser());
app.use(express.json())

mongoose.connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind( console, "MONGODB CONNECTION ERROR:" ));
db.once("open", () => {
    console.log("SUCCSFULLY CCONECTED to mungdb");
})

app.use((req, res, next) => {
  if (!req.cookies.userID) {
    const id = uuidv4();
    res.cookie("userID", id, { maxAge: 1000 * 60 * 60 * 24 * 7 });
    req.cookies.userID = id; 
  }
  next();
});

io.on("connection", (socket) => {
  console.log("user connected");

  socket.on("new_user", async (userName) => {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const cookieParts = cookieHeader.split("; ").find(c => c.startsWith("userID="));
    const userID = cookieParts ? cookieParts.split("=")[1] : uuidv4();

    let user = await User.findOne({ userID });

    if (!user) {
      user = new User({ userID, name: userName, orders: [], cart: [] });
      await user.save();
    }

    socket.data.userID = user.userID;
    users[user.userID] = socket.id;
    socket.broadcast.emit("user_connected", userName);
  });

  socket.on("place_order", async (food) => {
    const uID = socket.data.userID;
    const user = await User.findOne({ userID: uID });
    if (!user) return;

    if (food === "menu") {
      let meunu_list = Object.entries(menu)
        .map(([key, item]) => `${key}. ${item.name} -- ₦${item.price}`)
        .join("\n");

      socket.emit("send_chat_message", {
        message: "To order, type and send the number attached to the meal. \n\n On the menu today is: \n" + meunu_list,
        userName: "fidbot said: \n\n"
      });
      return;
    }

    if (isNaN(food) || !menu[food]) {
      socket.emit("send_chat_message", {
        message: "INVALID INPUT. Please look at the menu again",
        userName: " fidBOT SAID: \n\n"
      });
      return;
    }

    if (menu[food].stock > 0) {
      if (!cur_orders[uID]) cur_orders[uID] = [];

      menu[food].stock -= 1;

      cur_orders[uID].push({ id: food, name: menu[food].name, price: menu[food].price });

      const meals = cur_orders[uID].map(i => i.name).join(", ");
      const total = cur_orders[uID].reduce((s, i) => s + i.price, 0);

      socket.emit("send_chat_message", {
        message: `Added ${menu[food].name} to Cart.
                  Current order: ${meals}, total: ₦${total} 
                  \n If you'd like to add to that, look through the menu and send corresponding number. 
                  \n Or if you're done, send 99 to checkout `,
        userName: "fidBot said: \n\n",
      });
    } else {
      socket.emit("send_chat_message", {
        message: `fid is sad and sorry😔😔. ${menu[food].name} is not available rn`,
        userName: "fidbod said: \n\n",
      });
      return;
    }
  });

  socket.on("order_placed_from_payment", async ( {userID }) => {
  
    const user = await User.findOne({ userID });
    const cart = cur_orders[userID] || [];

    if (user && cart.length > 0) {
      const meals = cart.map(i => i.name).join(", ");
      const total = cart.reduce((s, i) => s + i.price, 0);

      user.orders.push({ meals, total, date: new Date() });
      await user.save();

      cur_orders[userID] = [];

      socket.emit("send_chat_message", {
        message: `Yayyyy!! Payment successful! Order placed: ${meals}, total ₦${total}.`,
        userName: "fidBot said:\n\n"
      });
    } else {
      socket.emit("send_chat_message", {
        message: "payment was succesful, but it seems no user attache",
        userName: "fidBot said: \n\n"
      });
    }
  });

  socket.on("get_cart_total", async (userID, cb) => {
    const cart = cur_orders[userID] || [];
    const total = cart.reduce((s, i) => s + i.price, 0);
    const user = await User.findOne({ userID });
    cb({ total, email: user ? user.name + "@test.com" : "test@example.com" });
  });


  socket.on("view_cart", () => {
    const uID = socket.data.userID;
    const cart = cur_orders[uID] || [];
    if (cart.length === 0) {
      socket.emit("send_chat_message", {
        message: "there's nothing in your cart right now,type and send 1 to see the menu ",
        userName: "fidBot said \n\n",
      });
      return;
    }

    const meals = cart.map(i => i.name).join(", ");
    const total = cart.reduce((s, i) => s + i.price, 0);

    socket.emit("send_chat_message", {
      message: `You have ${meals}, total: ₦${total} 
                in your cart. \n
                \n If you'd like to add to that, look through the menu and send corresponding number. 
                Or if you're done, send 99 to checkout `,
      userName: "fidbot said: \n\n"
    });
  });

   socket.on("view_past_orders", async () => {
    const user = await User.findOne({ userID: socket.data.userID });
    if (!user || user.orders.length === 0) {
      socket.emit("send_chat_message", {
        message: "fidbot looked everywhere but found no past orders 😢, type and send 1 to see the menu and start ordering!",
        userName: "fidBot said: \n\n",
      });
      return;
    }

    const history = user.orders.map(o => {
      const d = o.date ? new Date(o.date).toLocaleString() : "Unknown date";
      return `${d}: ${o.meals} (₦${o.total})`;
    }).join("\n\n");

    socket.emit("send_chat_message", {
      message: `Here are your past orders:\n\n${history} \n\n type and send 1 to see the menu and add more!`,
      userName: "fidBot said: \n\n",
    });
  });

  socket.on("cancel_order", () => {
    cur_orders[socket.data.userID] = [];
    socket.emit("send_chat_message", {
      message: "Order cancelled. \n fidbot is very sad",
      userName: "fidbot said \n\n",
    });
  });

  socket.on("delete", () => {
    delete users[socket.data.userID];
    delete cur_orders[socket.data.userID];
  });
});


app.post("/pay", async (req, res) => {
  const { email, amount, userID } = req.body;

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        callback_url: `${process.env.BASE_URL}/payment/callback`,
        amount: amount * 100, //pays5ack uses kobo, so amount in naira like 5000*100 =turn to boko
        metadata: {userID}
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      status: "success",
      url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ status: "error", message: "Payment initailizin failed" });
  }
});

//just to show the usr its been successful
app.get("/payment/callback", async (req, res) => {
  const { reference } = req.query;
  res.send("<h2>Payment made successfully! </h2><p>Your order has been placed! \nEnjoy fiding! </p>  \n\n <h6>thannk you for choosing Karbz Dehpour <h6>");
});

app.post("/paystack/webhook", express.json(), async (req, res) => {
  const event = req.body;

  if (event.event === "charge.success") {
    try {
      const { userID } = event.data.metadata || {}; 
      const socketID = users[userID];

      if (socketID) {
        io.to(socketID).emit("order_placed_from_payment", {userID });
      }
    } catch (err) {
      console.error("Webhook error:", err);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
