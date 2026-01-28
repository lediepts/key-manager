const express = require("express");
const mongoose = require("mongoose");
const { nanoid } = require("nanoid");
const path = require("path");
require("dotenv").config();

const app = express();

// Cấu hình Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Kết nối Database
mongoose.connect(process.env.MONGODB_URI);

const Key = mongoose.model(
  "Key",
  new mongoose.Schema({
    key: String,
    maxAccount: { type: Number, default: 2 },
    hwid: { type: String, default: null },
    isUsed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }),
);

// --- MIDDLEWARE BẢO MẬT ADMIN ---
const authAdmin = (req, res, next) => {
  // Lấy password từ Header Authorization (Basic Auth)
  const auth = {
    login: "admin",
    password: process.env.ADMIN_PASSWORD || "123456",
  };
  const b64auth = (req.headers.authorization || "").split(" ")[1] || "";
  const [login, password] = Buffer.from(b64auth, "base64")
    .toString()
    .split(":");

  if (login && password && login === auth.login && password === auth.password) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="401"');
  res.status(401).send("Bạn cần mật khẩu để truy cập trang này.");
};

// --- ROUTES QUẢN LÝ (Có bảo mật) ---

app.get("/admin", authAdmin, async (req, res) => {
  const keys = await Key.find().sort({ createdAt: -1 });
  res.render("dashboard", { keys });
});

app.post("/admin/generate", authAdmin, async (req, res) => {
  const count = Math.min(parseInt(req.body.count) || 1, 50);
  const maxAccount = Math.min(parseInt(req.body.maxAccount) || 1, 50);
  const newKeys = Array.from({ length: count }).map(() => ({
    key: nanoid(10).toUpperCase(),
    isUsed: false,
    maxAccount,
  }));
  await Key.insertMany(newKeys);
  res.redirect("/admin");
});

app.post("/admin/reset/:id", authAdmin, async (req, res) => {
  await Key.findByIdAndUpdate(req.params.id, { hwid: null, isUsed: false });
  res.redirect("/admin");
});
app.post("/admin/plus-acc/:id", authAdmin, async (req, res) => {
  const before = await Key.findById(req.params.id);
  await Key.findByIdAndUpdate(req.params.id, {
    maxAccount: (before.maxAccount || 1) + 1,
  });
  res.redirect("/admin");
});
app.post("/admin/minus-acc/:id", authAdmin, async (req, res) => {
  const before = await Key.findById(req.params.id);
  if (before.maxAccount > 1)
    await Key.findByIdAndUpdate(req.params.id, {
      maxAccount: (before.maxAccount || 1) - 1,
    });
  res.redirect("/admin");
});

app.post("/admin/delete/:id", authAdmin, async (req, res) => {
  await Key.findByIdAndDelete(req.params.id);
  res.redirect("/admin");
});

// --- API CHO ELECTRON (Không cần Auth để máy khách gọi) ---

app.post("/api/verify-key", async (req, res) => {
  const { key, hwid } = req.body;
  const keyDoc = await Key.findOne({ key });

  if (!keyDoc)
    return res.status(404).json({ valid: false, message: "Key sai!" });

  if (!keyDoc.isUsed) {
    keyDoc.hwid = hwid;
    keyDoc.isUsed = true;
    await keyDoc.save();
    return res.json({
      valid: true,
      maxAccount: keyDoc.maxAccount,
      message: "Kích hoạt thành công!",
    });
  }

  if (keyDoc.hwid === hwid) {
    return res.json({
      valid: true,
      maxAccount: keyDoc.maxAccount,
      message: "Xác thực thành công!",
    });
  } else {
    return res
      .status(403)
      .json({ valid: false, message: "Key đã dùng cho máy khác!" });
  }
});

if (process.env.NODE_ENV !== "production") {
  const PORT = 3003;
  app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`Trang quản trị: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
