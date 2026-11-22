import * as dashboardService from "../services/dashboard/dashboardService.js";
import * as itemService from "../services/items/itemService.js";
import { respond } from "../utils/respond.js";

// The example resource. Any signed-in role may call every action here; which rows it then
// sees or changes is the service's decision, from who the caller is.

export const getItems = async (req, res) => respond(res, await itemService.getAll(req.validatedQuery, req.user.id, req.user.role));

export const createItem = async (req, res) => respond(res, await itemService.create(req.body, req.user.id, req.user.role));

export const setItemStatus = async (req, res) => respond(res, await itemService.setStatus(req.params.id, req.body, req.user.id));

export const deleteItem = async (req, res) => respond(res, await itemService.remove(req.params.id, req.user.id));

// One endpoint for every role: the figures are scoped to the caller on the server.
export const getDashboardSummary = async (req, res) => respond(res, await dashboardService.getSummary(req.user.id, req.user.role));
