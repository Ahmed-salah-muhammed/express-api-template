import { httpStatus } from "../models/common/errorCodes.js";

/**
 * The one place a service's answer becomes an HTTP response. A service never throws for an
 * expected failure and never knows about status codes: it returns a failed ApiResponse with
 * a code, and httpStatus() says which status that code travels with. The envelope is the
 * body either way.
 */
export const respond = (res, response) =>
    res.status(response.success ? 200 : httpStatus(response.code)).json(response);
