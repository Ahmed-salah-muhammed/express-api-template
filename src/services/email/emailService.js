import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

// SMTP through nodemailer, configured by the SMTP_* settings. With no host set it sends
// nothing and says so in the log - which is the state of a fresh development machine.

/**
 * What was "sent" while SMTP_HOST=memory: nothing leaves the process, each message lands
 * here instead. The tests read a password-reset link out of it - the same place a person
 * would get it from, since the link never leaves by any other road.
 */
export const outbox = [];

let transport = null;

function getTransport() {
    if (transport) return transport;

    const { host, port, user, password, senderEmail } = env.email;

    transport = host === "memory"
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host,
            port,
            // 465 is TLS from the first byte; everything else starts plain and upgrades.
            secure: port === 465,
            // Some providers log in with a fixed name or an API-key id rather than the
            // sender address, so the user is its own setting and only defaults to it.
            auth: password ? { user: user || senderEmail, pass: password } : undefined,
            // A mail server that never answers must not hold a request open.
            connectionTimeout: 15_000,
            socketTimeout: 15_000,
        });

    return transport;
}

/** Sends one message. Returns false when it was not sent - never throws for a delivery failure. */
export async function sendEmail({ to, subject, html, text }) {
    const { host, senderEmail, senderName } = env.email;

    if (!host || (host !== "memory" && !senderEmail)) {
        logger.warn("SMTP_HOST / SMTP_SENDER_EMAIL are not configured; no mail was sent.");
        return false;
    }

    const message = { from: { name: senderName || env.appName, address: senderEmail || "no-reply@localhost" }, to, subject, html, text };

    try {
        await getTransport().sendMail(message);
        if (host === "memory") outbox.push(message);
        return true;
    } catch (error) {
        // For a password-reset mail this is the only trace that it never arrived, because
        // the caller is deliberately told nothing (see authService.forgetPassword).
        logger.error("Sending email failed.", error);
        return false;
    }
}

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export async function sendPasswordResetEmail(to, resetLink) {
    let html;
    try {
        const template = await fs.readFile(path.join(import.meta.dirname, "../../templates/resetPassword.html"), "utf8");
        html = template.replaceAll("{{ResetLink}}", escapeHtml(resetLink)).replaceAll("{{AppName}}", escapeHtml(env.appName));
    } catch {
        // Fallback if the template is missing from the deployment.
        html = `<p>Click <a href="${escapeHtml(resetLink)}">here</a> to reset your password.</p>`;
    }

    return sendEmail({ to, subject: `Reset your password - ${env.appName}`, html, text: `Reset your password: ${resetLink}` });
}
