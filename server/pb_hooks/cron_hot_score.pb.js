/// <reference path="../pb_data/types.d.ts" />

cronAdd("update_hot_scores", "*/10 * * * *", () => {
    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 7);

    const filter = `created >= "${limitDate.toISOString().replace("T", " ")}" && moderation_status = "active"`;

    try {
        const records = $app.findRecordsByFilter("posts", filter, "-created", 500, 0);

        $app.runInTransaction((txApp) => {
            for (const record of records) {
                if (!record) continue;
                const created = new Date(record.getDateTime("created").time());
                const ageHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

                const likes = record.getInt("like_count") || 0;
                const comments = record.getInt("comment_count") || 0;
                const views = record.getInt("view_count") || 0;

                const gravity = 1.5;
                const score = (likes * 5 + comments * 3 + views) / Math.pow(ageHours + 2, gravity);

                const form = new RecordUpsertForm(txApp, record);
                form.load({ hot_score: score });
                form.submit();
            }
        });

        console.log(`[HotScore] Updated scores for ${records.length} posts.`);
    } catch (e) {
        console.error(`[HotScore] Update failed: ${e}`);
    }
});
