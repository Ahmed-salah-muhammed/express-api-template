import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import * as itemsController from "../controllers/items.controller.js";
import * as usersController from "../controllers/users.controller.js";
import { UserRole } from "../enums/index.js";
import { authenticate, authorize } from "../middlewares/authenticate.js";
import { passwordResetRateLimit } from "../middlewares/rateLimit.js";
import { uploadSingle } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { forgetPasswordSchema, loginSchema, resetPasswordSchema } from "../models/dtos/auth.dto.js";
import { createItemSchema, itemFilterSchema, updateItemStatusSchema } from "../models/dtos/items.dto.js";
import {
    adminResetPasswordSchema, changePasswordSchema, createUserSchema, updateUserSchema, updateUserStatusSchema, userFilterSchema,
} from "../models/dtos/users.dto.js";
// [new-feature:route-import] - scripts/new-feature.mjs imports the next feature's router above this line

// ------------------- Every route of /api/v1, in one place -------------------
// Each line reads left to right as the request travels: who may call it (authenticate,
// authorize), what it may carry (validate), then the controller. Paths match without
// regard to case, so the client's "Users/me" and "users/me" are the same route.

const adminOnly = authorize(UserRole.Admin);

// ----------------------------------------------------------------- auth
// Anonymous by design: these are the endpoints you need *before* you have a token.
//
// There is deliberately no signup route. A public endpoint that creates accounts has to
// decide what role they get, and one that takes the role from the caller lets anyone make
// themselves an administrator. Accounts are created only through POST /users (Admin only).
const auth = Router();

// Two distinct endpoints rather than one that sniffs the identifier itself: the client
// knows which one the user typed.
auth.post("/login-email", validate({ body: loginSchema }), authController.loginByEmail);
auth.post("/login-username", validate({ body: loginSchema }), authController.loginByUsername);
auth.post("/forget-password", passwordResetRateLimit, validate({ body: forgetPasswordSchema }), authController.forgetPassword);
auth.post("/reset-password", passwordResetRateLimit, validate({ body: resetPasswordSchema }), authController.resetPassword);

// ----------------------------------------------------------------- users
const users = Router();
users.use(authenticate);

// Self-service first - "me" must never be read as an id. Any signed-in account, about
// itself only: the id always comes from the token.
users.get("/me", usersController.getMyProfile);
users.post("/me/password", validate({ body: changePasswordSchema }), usersController.changeMyPassword);
users.post("/me/photo", uploadSingle("file"), usersController.updateMyProfilePicture);
users.delete("/me/photo", usersController.deleteMyProfilePicture);

// User management - system administration only.
users.get("/", adminOnly, validate({ query: userFilterSchema }), usersController.getUsers);
users.post("/", adminOnly, validate({ body: createUserSchema }), usersController.createUser);
users.get("/:id", adminOnly, usersController.getUserById);
users.patch("/:id", adminOnly, validate({ body: updateUserSchema }), usersController.updateUser);
users.post("/:id/reset-password", adminOnly, validate({ body: adminResetPasswordSchema }), usersController.resetUserPassword);
users.patch("/:id/status", adminOnly, validate({ body: updateUserStatusSchema }), usersController.setUserStatus);
users.delete("/:id", adminOnly, usersController.deleteUser);

// ----------------------------------------------------------------- items (the example)
const items = Router();
items.use(authenticate);

items.get("/", validate({ query: itemFilterSchema }), itemsController.getItems);
items.post("/", validate({ body: createItemSchema }), itemsController.createItem);
items.patch("/:id/status", validate({ body: updateItemStatusSchema }), itemsController.setItemStatus);
items.delete("/:id", itemsController.deleteItem);

// ----------------------------------------------------------------- dashboard
const dashboard = Router();
dashboard.use(authenticate);

dashboard.get("/summary", itemsController.getDashboardSummary);

// -----------------------------------------------------------------
export const apiRouter = Router();

apiRouter.use("/auth", auth);
apiRouter.use("/users", users);
apiRouter.use("/items", items);
apiRouter.use("/dashboard", dashboard);
// [new-feature:route] - scripts/new-feature.mjs mounts the next feature's router above this line
