require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();


const app = express();

app.use(cors());
app.use(express.json());

/* Test route */
app.get("/", (req, res) => {
  res.send("Order Management API Running 🚀");
});

/* Test database connection */
app.get("/test-db", async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW()`;
    res.json({
      message: "Database Connected",
      time: result
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* Example: create order */
app.post("/orders", async (req, res) => {
  try {
    const { orderNumber, createdById, divisionId } = req.body;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        createdById,
        currentDivisionId: divisionId
      }
    });

    res.json(order);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* get orders */
app.get("/orders", async (req, res) => {
  try {

    const orders = await prisma.order.findMany({
      include: {
        createdBy: true,
        currentDivision: true
      }
    });

    res.json(orders);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});