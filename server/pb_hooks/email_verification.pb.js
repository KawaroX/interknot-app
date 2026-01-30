/// <reference path="../pb_data/types.d.ts" />

const USERS_COLLECTION = "users";
const SYSTEM_MESSAGES = "system_messages";
const VERIFICATION_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const RESEND_LIMIT_PER_DAY = 3;
const RESEND_MIN_INTERVAL_MS = 60 * 1000;

const createSystemMessage = (app, userId, title, body) => {
  try {
    const collection = app.findCollectionByNameOrId(SYSTEM_MESSAGES);
    if (!collection) return;
    const record = new Record(collection);
    record.set("user", userId);
    record.set("message_type", "system");
    record.set("actor", null);
    record.set("title", title);
    record.set("body", body ?? "");
    record.set("target_type", null);
    record.set("post", null);
    record.set("comment", null);
    record.set("status", "unread");
    app.save(record);
  } catch (err) {
    console.error("[EmailVerify] system message create failed:", err);
  }
};

const isUsersRecord = (record) => {
  if (!record) return false;
  const collection = record.collection?.();
  return collection && collection.name === USERS_COLLECTION;
};

const hasExternalAuth = (app, record) => {
  try {
    const auths = app.findAllExternalAuthsByRecord(record) || [];
    return auths.some((auth) => !!auth);
  } catch (err) {
    console.error("[EmailVerify] external auth lookup failed:", err);
    return false;
  }
};

onRecordAfterCreateSuccess((e) => {
  const record = e.record;
  if (!isUsersRecord(record)) return;
  if (record.getBool("verified")) return;
  if (hasExternalAuth(e.app, record)) return;
  createSystemMessage(
    e.app,
    record.id,
    "邮箱未验证",
    "我们已发送验证邮件，请在 3 日内完成验证。未验证将无法继续登录；可在登录页点击“没收到验证邮件？重新发送”。"
  );
});

onRecordAfterUpdateSuccess((e) => {
  const record = e.record;
  if (!isUsersRecord(record)) return;
  const isVerified = record.getBool("verified");
  if (!isVerified) return;
  const original = record.original?.();
  const wasVerified = original ? original.getBool("verified") : false;
  if (wasVerified) return;
  createSystemMessage(
    e.app,
    record.id,
    "邮箱验证通过",
    "你的邮箱已验证成功，现在可以正常使用全部功能。"
  );
});

onRecordAuthRequest((e) => {
  const record = e.record;
  if (!isUsersRecord(record)) return;
  if (e.authMethod === "oauth2") return;
  if (record.getBool("verified")) return;
  const createdAt = record.getDateTime("created")?.time?.();
  if (!createdAt) return;
  const now = new Date();
  if (now.getTime() - createdAt.getTime() > VERIFICATION_GRACE_MS) {
    throw new ApiError(403, "邮箱未验证且已超过 3 日，请先完成邮箱验证。");
  }
});

onRecordRequestVerificationRequest((e) => {
  const record = e.record;
  if (!isUsersRecord(record)) return;
  if (record.getBool("verified")) {
    throw new ApiError(400, "邮箱已验证，无需重复发送。");
  }

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const lastAt = record.getDateTime("verification_resend_last_at")?.time?.();
  const lastDay = record.getString("verification_resend_day") || "";
  let count = record.getInt("verification_resend_count") || 0;

  if (lastDay !== dayKey) {
    count = 0;
  }

  if (lastAt && now.getTime() - lastAt.getTime() < RESEND_MIN_INTERVAL_MS) {
    throw new ApiError(429, "发送过于频繁，请 1 分钟后再试。");
  }

  if (count >= RESEND_LIMIT_PER_DAY) {
    throw new ApiError(429, "今日发送次数已达上限（3 次）。");
  }

  try {
    const form = new RecordUpsertForm(e.app, record);
    form.load({
      verification_resend_day: dayKey,
      verification_resend_count: count + 1,
      verification_resend_last_at: now.toISOString(),
    });
    form.submit();
  } catch (err) {
    console.error("[EmailVerify] resend limit update failed:", err);
  }
});
