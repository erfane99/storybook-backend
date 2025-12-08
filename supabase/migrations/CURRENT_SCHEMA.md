# Current Database Schema - StoryCanvas

**Last Verified:** 2024-12-08  
**Status:** ✅ Production Ready  
**Environment:** Supabase PostgreSQL

---

## Table: cartoon_images

**Purpose:** Store user cartoonized character images with caching for character descriptions

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | NO | - | Owner (FK: auth.users) |
| original_cloudinary_url | text | NO | - | Source photo URL |
| original_cloudinary_public_id | text | YES | null | Source image public_id |
| cartoonized_cloudinary_url | text | NO | - | Generated cartoon URL |
| cartoonized_cloudinary_public_id | text | NO | - | Cartoon public_id (for cleanup) |
| cartoon_style | text | NO | - | Art style (comic-book, storybook, etc) |
| character_description | text | NO | - | Cached Gemini character DNA |
| original_prompt | text | YES | null | Optional generation prompt |
| generation_count | integer | YES | 1 | Number of generations |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Last update timestamp |

**Status:** ✅ CORRECT - Matches code requirements  
**Used By:** Worker (character caching), Backend API (cartoon storage)

---

## Table: environmental_validation_results

**Purpose:** Track environmental consistency validation for comic book pages

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| job_id | uuid | NO | - | FK: storybook_jobs |
| page_number | integer | NO | - | Page being validated |
| overall_coherence | numeric | NO | - | Overall score (0-100) |
| location_consistency | numeric | NO | - | Location score (0-100) |
| lighting_consistency | numeric | NO | - | Lighting score (0-100) |
| color_palette_consistency | numeric | NO | - | Color score (0-100) |
| architectural_consistency | numeric | NO | - | Architecture score (0-100) |
| cross_panel_consistency | numeric | NO | - | Cross-panel score (0-100) |
| panel_scores | jsonb | NO | '[]'::jsonb | Per-panel details |
| detailed_analysis | text | NO | - | GPT-4 Vision analysis |
| failure_reasons | jsonb | NO | '[]'::jsonb | Failure details |
| passes_threshold | boolean | NO | - | Pass/fail (>=70%) |
| validation_timestamp | timestamptz | NO | now() | Validation time |
| attempt_number | integer | NO | 1 | Regeneration attempt (1-2) |
| regeneration_triggered | boolean | NO | false | Was page regenerated? |
| created_at | timestamptz | NO | now() | Record creation |

**Status:** ✅ APPLIED - Ready for validation tracking  
**Used By:** Worker (quality validation)  
**Threshold:** 70% overall_coherence required to pass

---

## Migration Status

✅ `20251115132121_environmental_validation_results.sql` - APPLIED  
✅ `cartoon_images` schema - CORRECT (matches code)

**No pending migrations required**

---

## Code References

**Worker Project:**
- Character caching: `src/services/database/database-service.ts`
- Environmental validation: `src/services/ai/modular/environmental-consistency-validator.ts`

**Backend API Project:**
- Cartoon storage: `app/api/cartoon/save/route.ts`
- Previous cartoons: `app/api/cartoon/previous/route.ts`

---

## Verification

Schema verified on 2024-12-08 via SQL query:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('cartoon_images', 'environmental_validation_results')
ORDER BY table_name, ordinal_position;
```

All columns match code expectations. No schema changes needed.