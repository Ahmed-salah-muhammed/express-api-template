import * as authService from "../services/auth/authService.js";
import { respond } from "../utils/respond.js";

// A controller is one line per action: call the service, turn its answer into HTTP.

export const loginByEmail = async (req, res) => respond(res, await authService.loginByEmail(req.body));

export const loginByUsername = async (req, res) => respond(res, await authService.loginByUsername(req.body));

export const forgetPassword = async (req, res) => respond(res, await authService.forgetPassword(req.body));

export const resetPassword = async (req, res) => respond(res, await authService.resetPassword(req.body));
