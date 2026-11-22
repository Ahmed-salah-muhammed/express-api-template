import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * The token a successful login hands out. It carries the role, so authorization needs no
 * lookup - and the account's security stamp, so the lookup that *is* made on every request
 * (middlewares/authenticate.js) can refuse a token minted before the role or the password
 * changed.
 */
export function signToken(user) {
    return jwt.sign(
        { role: user.role, stamp: user.securityStamp, email: user.email, fullName: user.fullName },
        env.jwt.secret,
        {
            algorithm: "HS256",
            subject: user.id,
            jwtid: randomUUID(),
            issuer: env.jwt.issuer,
            audience: env.jwt.audience,
            expiresIn: `${env.jwt.expiryDays}d`,
        },
    );
}

/** The verified payload, or a throw. The algorithm is pinned: a token that names its own is not trusted. */
export const verifyToken = (token) =>
    jwt.verify(token, env.jwt.secret, { algorithms: ["HS256"], issuer: env.jwt.issuer, audience: env.jwt.audience });
