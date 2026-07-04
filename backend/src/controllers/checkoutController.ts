import type { Request, Response, NextFunction } from "express";
import z from "zod";
import { getAuth } from "@clerk/express";
import { getLocalUser } from "../lib/users";
import { db } from "../db";
import { orderItems, orders, products } from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function createCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // only signed-in users can start checkout
    const { userId, isAuthenticated } = getAuth(req);
    if (!isAuthenticated || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = cartSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid cart", details: parsed.error.flatten() });
      return;
    }

    const localUser = await getLocalUser(userId);
    if (!localUser) {
      res.status(503).json({ error: "Account not synced yet" });
      return;
    }

    const ids = parsed.data.items.map((i) => i.productId);

    // load every cart product that exists, is active, and matches the IDs we asked for.
    const prodRows = await db
      .select()
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.active, true)));

    if (prodRows.length !== ids.length) {
      res.status(400).json({ error: "One or more products are invalid" });
      return;
    }

    const byId = new Map(prodRows.map((p) => [p.id, p]));
    let totalCents = 0;

    for (const line of parsed.data.items) {
      const p = byId.get(line.productId)!;
      totalCents += p.priceCents * line.quantity;
    }

    // Create the order directly with "paid" status (dummy payment)
    const [order] = await db
      .insert(orders)
      .values({
        userId: localUser.id,
        status: "paid",
        totalCents,
      })
      .returning();

    // Create order items
    const orderItemsData = parsed.data.items.map((line) => {
      const p = byId.get(line.productId)!;
      return {
        orderId: order.id,
        productId: p.id,
        quantity: line.quantity,
        unitPriceCents: p.priceCents,
      };
    });

    if (orderItemsData.length > 0) {
      await db.insert(orderItems).values(orderItemsData);
    }

    res.json({
      orderId: order.id,
      checkoutUrl: `/checkout/return?order_id=${order.id}`,
    });
  } catch (e) {
    next(e);
  }
}
