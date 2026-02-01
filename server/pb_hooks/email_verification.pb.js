/// <reference path="../pb_data/types.d.ts" />

const createSystemMessage = (app, userId, title, body) => {
  try {
    const collection = app.findCollectionByNameOrId("system_messages");
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
    // Save as admin to bypass collection permissions
    $app.asAdmin().save(record);
  } catch (err) {
    console.error("[EmailVerify] system message create failed:", err);
  }
};

onRecordAfterCreateSuccess((e) => {
  const record = e.record;
  if (!record) {
    e.next();
    return;
  }
  const collection = record.collection && record.collection();
  if (!collection || collection.name !== "users") {
    e.next();
    return;
  }
  if (record.getBool("verified")) {
    e.next();
    return;
  }
  try {
    const auths = e.app.findAllExternalAuthsByRecord(record) || [];
    if (auths.some((auth) => !!auth)) {
      e.next();
      return;
    }
  } catch (err) {
    console.error("[EmailVerify] external auth lookup failed:", err);
  }
  createSystemMessage(
    e.app,
    record.id,
    "邮箱未验证",
    "我们已发送验证邮件，请在 3 日内完成验证。未验证将无法继续登录；可在登录页点击“没收到验证邮件？重新发送”。"
  );
  e.next();
});

onRecordAfterUpdateSuccess((e) => {
  const record = e.record;
  if (!record) {
    e.next();
    return;
  }
  const collection = record.collection && record.collection();
  if (!collection || collection.name !== "users") {
    e.next();
    return;
  }
  const isVerified = record.getBool("verified");
  if (!isVerified) {
    e.next();
    return;
  }
  const original = record.original?.();
  const wasVerified = original ? original.getBool("verified") : false;
  if (wasVerified) {
    e.next();
    return;
  }
  createSystemMessage(
    e.app,
    record.id,
    "邮箱验证通过",
    "你的邮箱已验证成功，现在可以正常使用全部功能。"
  );
  e.next();
});

onRecordAuthRequest((e) => {
  const record = e.record;
  if (!record) {
    e.next();
    return;
  }
  const collection = record.collection && record.collection();
  if (!collection || collection.name !== "users") {
    e.next();
    return;
  }
  if (e.authMethod === "oauth2") {
    e.next();
    return;
  }
  if (record.getBool("verified")) {
    e.next();
    return;
  }
  const createdRaw = record.getString("created");
  if (!createdRaw) {
    e.next();
    return;
  }
  const createdAt = new Date(createdRaw);
  if (Number.isNaN(createdAt.getTime())) {
    e.next();
    return;
  }
  if (Date.now() - createdAt.getTime() > 3 * 24 * 60 * 60 * 1000) {
    throw new ApiError(403, "邮箱未验证且已超过 3 日，请先完成邮箱验证。");
  }
  e.next();
});

onRecordRequestVerificationRequest((e) => {
  const record = e.record;
  if (!record) {
    e.next();
    return;
  }
  const collection = record.collection && record.collection();
  if (!collection || collection.name !== "users") {
    e.next();
    return;
  }
  if (record.getBool("verified")) {
    throw new ApiError(400, "邮箱已验证，无需重复发送。");
  }

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const lastAtRaw = record.getString("verification_resend_last_at");
  const lastAt = lastAtRaw ? new Date(lastAtRaw) : null;
  const lastDay = record.getString("verification_resend_day") || "";
  let count = record.getInt("verification_resend_count") || 0;

  if (lastDay !== dayKey) {
    count = 0;
  }

  if (lastAt && !Number.isNaN(lastAt.getTime()) && now.getTime() - lastAt.getTime() < 60 * 1000) {
    throw new ApiError(429, "发送过于频繁，请 1 分钟后再试。");
  }

  if (count >= 3) {
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
  e.next();
});
