// supabase/functions/cleanup-attachments/index.ts
// Deletes files from support-attachments bucket that are 30+ days old
// Deploy with: supabase functions deploy cleanup-attachments
// Schedule in Supabase Dashboard → Edge Functions → Schedules → every day at 3am

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET       = 'support-attachments';
const MAX_AGE_DAYS = 30;

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

    // List all files in the bucket
    const { data: files, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

    if (listErr) throw listErr;
    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: 'No files found' }), { status: 200 });
    }

    // Filter files older than MAX_AGE_DAYS
    const toDelete = files
      .filter(f => f.created_at && new Date(f.created_at) < cutoff)
      .map(f => f.name);

    if (toDelete.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: 'No old files to delete' }), { status: 200 });
    }

    // Delete in batches of 100
    let totalDeleted = 0;
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const { error: delErr } = await supabase.storage.from(BUCKET).remove(batch);
      if (delErr) console.error('[cleanup] batch delete error:', delErr);
      else totalDeleted += batch.length;
    }

    console.log(`[cleanup-attachments] Deleted ${totalDeleted} file(s) older than ${MAX_AGE_DAYS} days`);

    return new Response(
      JSON.stringify({ deleted: totalDeleted, cutoff: cutoff.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[cleanup-attachments] Error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
