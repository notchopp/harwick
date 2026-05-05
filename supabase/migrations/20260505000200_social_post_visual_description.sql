-- Vision-on-intake: store the visual description the model produced from
-- the post's image so subsequent turns reuse it without re-paying the
-- ~2¢ vision call.
alter table public.social_posts
  add column if not exists media_url text,
  add column if not exists visual_description text;
