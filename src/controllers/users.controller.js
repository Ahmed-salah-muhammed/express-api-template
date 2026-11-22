import * as userService from "../services/users/userService.js";
import { respond } from "../utils/respond.js";

// ----------------- User management (Admin only - see the routes) -----------------

export const getUsers = async (req, res) => respond(res, await userService.getFiltered(req.validatedQuery));

export const getUserById = async (req, res) => respond(res, await userService.getById(req.params.id));

export const createUser = async (req, res) => respond(res, await userService.create(req.body));

export const updateUser = async (req, res) => respond(res, await userService.update(req.params.id, req.body, req.user.id));

export const resetUserPassword = async (req, res) => respond(res, await userService.resetPassword(req.params.id, req.body));

export const setUserStatus = async (req, res) => respond(res, await userService.setActiveStatus(req.params.id, req.body, req.user.id));

export const deleteUser = async (req, res) => respond(res, await userService.remove(req.params.id, req.user.id));

// ----------------- Self-service -----------------

// Doubles as "who am I" and "is my token still valid" for the client.
export const getMyProfile = async (req, res) => respond(res, await userService.getById(req.user.id));

export const changeMyPassword = async (req, res) => respond(res, await userService.changeMyPassword(req.user.id, req.body));

export const updateMyProfilePicture = async (req, res) => respond(res, await userService.updateMyProfilePicture(req.user.id, req.file));

export const deleteMyProfilePicture = async (req, res) => respond(res, await userService.deleteMyProfilePicture(req.user.id));
