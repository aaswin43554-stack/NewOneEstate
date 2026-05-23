const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedOpsDetails() {
  const client = await pool.connect();
  try {
    console.log('[seed-ops] Starting database seeding for One Estate Coffee Operations...');
    await client.query('BEGIN');

    // 1. Get Tenant and Admin User
    const { rows: tenants } = await client.query("SELECT id FROM oec_tenants WHERE slug = 'one-estate'");
    if (tenants.length === 0) {
      throw new Error("Tenant 'one-estate' not found. Run main seed first.");
    }
    const tenantId = tenants[0].id;

    const { rows: users } = await client.query("SELECT id FROM oec_users WHERE email = 'admin@oneestate.com'");
    if (users.length === 0) {
      throw new Error("Admin user not found. Run main seed first.");
    }
    const adminId = users[0].id;

    // Clear old data under this tenant to avoid duplicate keys and ensure clean seed
    await client.query('DELETE FROM oec_journal_versions WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_journal_entries WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_cupping_samples WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_cupping_sessions WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_session_notes WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_roast_sessions WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_roast_profiles WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_contact_request_links WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_allocation_requests WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_allocations WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_lots WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM oec_contacts WHERE tenant_id = $1', [tenantId]);

    console.log('[seed-ops] Cleared old tenant data.');

    // 2. Insert Green Bean Lots
    // Lot 1: 2025 Harvest Lot
    const { rows: [lot1] } = await client.query(
      `INSERT INTO oec_lots 
        (tenant_id, lot_code, estate, process, harvest_year, arrival_date, arrival_weight_g, current_weight_g, moisture_content, water_activity, storage_location, supplier_notes, created_by, updated_by)
       VALUES ($1, 'LOT-2025-SS01', 'Suan Saket Estate', 'Washed', 2025, '2025-03-15', 500000, 42000, 11.20, 0.580, 'Shelf A-1', 'Field blend of Typica, Bourbon, Catimor, and Caturra. Excellent quality and density.', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    // Lot 2: 2026 Harvest Lot
    const { rows: [lot2] } = await client.query(
      `INSERT INTO oec_lots 
        (tenant_id, lot_code, estate, process, harvest_year, arrival_date, arrival_weight_g, current_weight_g, moisture_content, water_activity, storage_location, supplier_notes, created_by, updated_by)
       VALUES ($1, 'LOT-2026-SS02', 'Suan Saket Estate', 'Washed', 2026, '2026-03-10', 1000000, 950000, 10.80, 0.560, 'Shelf A-2', 'Terroir-focused field blend grown under shade canopy at 1,200m elevation. Outstanding sweetness and clarity.', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    // Lot 3: Natural Lot (mocked for inventory richness)
    const { rows: [lot3] } = await client.query(
      `INSERT INTO oec_lots 
        (tenant_id, lot_code, estate, process, harvest_year, arrival_date, arrival_weight_g, current_weight_g, moisture_content, water_activity, storage_location, supplier_notes, created_by, updated_by)
       VALUES ($1, 'LOT-2026-SS03', 'Suan Saket Estate', 'Natural', 2026, '2026-03-25', 300000, 300000, 11.50, 0.590, 'Shelf B-1', 'Micro-batch of Natural process coffee. Vibrant fruit profile and intense sweetness.', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    console.log('[seed-ops] Seeded green bean lots.');

    // 3. Insert Allocations
    // W-01 (Archived, 2025 Washed)
    const { rows: [alloc1] } = await client.query(
      `INSERT INTO oec_allocations 
        (tenant_id, allocation_code, lot_id, estate, process, harvest_year, planned_green_quantity_g, planned_bag_size_g, planned_price_json, window_open_date, window_close_date, state, created_by, updated_by)
       VALUES ($1, 'W-01', $2, 'Suan Saket Estate', 'Washed', 2025, 150000, 200, '{"THB": 450, "SGD": 22}', '2025-05-01', '2025-05-06', 'archived', $3, $3)
       RETURNING id`,
      [tenantId, lot1.id, adminId]
    );

    // W-02 (Current active, 2026 Washed)
    const { rows: [alloc2] } = await client.query(
      `INSERT INTO oec_allocations 
        (tenant_id, allocation_code, lot_id, estate, process, harvest_year, planned_green_quantity_g, planned_bag_size_g, planned_price_json, window_open_date, window_close_date, state, created_by, updated_by)
       VALUES ($1, 'W-02', $2, 'Suan Saket Estate', 'Washed', 2026, 250000, 200, '{"THB": 480, "SGD": 24}', '2026-05-01', '2026-05-10', 'open_for_requests', $3, $3)
       RETURNING id`,
      [tenantId, lot2.id, adminId]
    );

    // W-03 (Upcoming, 2026 Honey/Natural process or Washed)
    const { rows: [alloc3] } = await client.query(
      `INSERT INTO oec_allocations 
        (tenant_id, allocation_code, lot_id, estate, process, harvest_year, planned_green_quantity_g, planned_bag_size_g, planned_price_json, window_open_date, window_close_date, state, created_by, updated_by)
       VALUES ($1, 'W-03', $2, 'Suan Saket Estate', 'Washed', 2026, 250000, 200, '{"THB": 480, "SGD": 24}', '2026-06-15', '2026-06-20', 'upcoming', $3, $3)
       RETURNING id`,
      [tenantId, lot2.id, adminId]
    );

    // Ensure next sequence value starts after W-03
    await client.query(
      `INSERT INTO oec_allocation_sequence (tenant_id, next_val) 
       VALUES ($1, 4) 
       ON CONFLICT (tenant_id) DO UPDATE SET next_val = EXCLUDED.next_val`,
      [tenantId]
    );

    console.log('[seed-ops] Seeded allocations.');

    // 4. Insert Contacts (Buyers)
    const { rows: [c1] } = await client.query(
      `INSERT INTO oec_contacts (tenant_id, name, primary_contact_method, location, market_segment, preferred_channel, personal_notes, status, created_by, updated_by)
       VALUES ($1, 'Alice Tan', 'alice@tan-coffee.sg', 'Singapore', 'Singapore', 'WhatsApp', 'SCA Sensory Judge. Prefers Washed coffees with clean acidity.', 'private_list', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    const { rows: [c2] } = await client.query(
      `INSERT INTO oec_contacts (tenant_id, name, primary_contact_method, location, market_segment, preferred_channel, personal_notes, status, created_by, updated_by)
       VALUES ($1, 'Korn Doi', 'korn@doisaket.th', 'Chiang Mai', 'Laos', 'In_Person', 'Local cafe owner in Doi Saket. Regular buyer of micro-lots.', 'active_buyer', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    const { rows: [c3] } = await client.query(
      `INSERT INTO oec_contacts (tenant_id, name, primary_contact_method, location, market_segment, preferred_channel, personal_notes, status, created_by, updated_by)
       VALUES ($1, 'Marcus Lee', '@marcus_brews', 'Kuala Lumpur', 'Thailand', 'Instagram', 'Home brewing enthusiast, active on Instagram. Loves natural/anaerobic processes.', 'prospect', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    console.log('[seed-ops] Seeded contacts.');

    // 5. Insert Allocation Requests
    // W-01 requests (fulfilled)
    await client.query(
      `INSERT INTO oec_allocation_requests (tenant_id, allocation_id, contact_name, contact_method, channel, quantity_bags, status, notes, created_by, updated_by)
       VALUES ($1, $2, 'Korn Doi', 'korn@doisaket.th', 'In_Person', 20, 'fulfilled', 'Picked up directly at the processing station.', $3, $3)`,
      [tenantId, alloc1.id, adminId]
    );

    // W-02 requests
    const { rows: [req1] } = await client.query(
      `INSERT INTO oec_allocation_requests (tenant_id, allocation_id, contact_name, contact_method, channel, quantity_bags, status, notes, created_by, updated_by)
       VALUES ($1, $2, 'Alice Tan', 'alice@tan-coffee.sg', 'WhatsApp', 3, 'confirmed', 'Request for Singapore dispatch.', $3, $3)
       RETURNING id`,
      [tenantId, alloc2.id, adminId]
    );

    const { rows: [req2] } = await client.query(
      `INSERT INTO oec_allocation_requests (tenant_id, allocation_id, contact_name, contact_method, channel, quantity_bags, status, notes, created_by, updated_by)
       VALUES ($1, $2, 'Marcus Lee', '@marcus_brews', 'Instagram', 5, 'pending', 'Interested in the new 2026 field blend.', $3, $3)
       RETURNING id`,
      [tenantId, alloc2.id, adminId]
    );

    // Link contacts to requests
    await client.query(
      `INSERT INTO oec_contact_request_links (tenant_id, contact_id, allocation_request_id, created_by)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $4)`,
      [tenantId, c1.id, req1.id, adminId, c3.id, req2.id]
    );

    console.log('[seed-ops] Seeded allocation requests.');

    // 6. Insert Roast Profiles
    // Profile 1: Washed 2025 (retired)
    const { rows: [prof1] } = await client.query(
      `INSERT INTO oec_roast_profiles (tenant_id, estate, process, harvest_year, charge_temp_c, target_dtr, eject_temp_c, total_time_target_s, flavour_target, status, created_by, updated_by)
       VALUES ($1, 'Suan Saket Estate', 'Washed', 2025, 200, 15.50, 212, 680, 'Jasmine, lemon, milk chocolate, medium body.', 'retired', $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    // Profile 2: Washed 2026 (approved)
    const { rows: [prof2] } = await client.query(
      `INSERT INTO oec_roast_profiles (tenant_id, estate, process, harvest_year, charge_temp_c, target_dtr, eject_temp_c, total_time_target_s, flavour_target, status, approved_at, approved_by, created_by, updated_by)
       VALUES ($1, 'Suan Saket Estate', 'Washed', 2026, 202, 16.00, 214, 660, 'Jasmine tea, citrus blossom, honey sweetness, clean and creamy mouthfeel.', 'approved', NOW(), $2, $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    console.log('[seed-ops] Seeded roast profiles.');

    // 7. Insert Roast Sessions
    // Session 1: Washed 2025 W-01 completed roasts
    const { rows: [rs1] } = await client.query(
      `INSERT INTO oec_roast_sessions 
        (tenant_id, allocation_id, is_development, batch_code, green_weight_in_g, roasted_weight_out_g, charge_temp_c, eject_temp_c, total_time_seconds, development_time_seconds, dtr, status, started_at, ended_at, created_by, updated_by)
       VALUES ($1, $2, false, 'ALLOC-W01-B01', 150000, 126000, 200, 212, 678, 105, 15.48, 'approved_for_bagging', '2025-05-12 09:00:00+07', '2025-05-12 09:12:00+07', $3, $3)
       RETURNING id`,
      [tenantId, alloc1.id, adminId]
    );

    // Session 2: Washed 2026 W-02 development/sample roast
    const { rows: [rs2] } = await client.query(
      `INSERT INTO oec_roast_sessions 
        (tenant_id, allocation_id, is_development, batch_code, green_weight_in_g, roasted_weight_out_g, charge_temp_c, eject_temp_c, total_time_seconds, development_time_seconds, dtr, status, started_at, ended_at, created_by, updated_by)
       VALUES ($1, $2, true, 'DEV-2026-W01', 1000, 842, 202, 213, 655, 104, 15.88, 'completed', '2026-04-18 14:00:00+07', '2026-04-18 14:11:00+07', $3, $3)
       RETURNING id`,
      [tenantId, alloc2.id, adminId]
    );

    // Session 3: Washed 2026 W-02 production roast
    const { rows: [rs3] } = await client.query(
      `INSERT INTO oec_roast_sessions 
        (tenant_id, allocation_id, is_development, batch_code, green_weight_in_g, roasted_weight_out_g, charge_temp_c, eject_temp_c, total_time_seconds, development_time_seconds, dtr, status, started_at, ended_at, created_by, updated_by)
       VALUES ($1, $2, false, 'ALLOC-W02-B01', 125000, 105500, 202, 214, 662, 106, 16.01, 'completed', '2026-05-15 10:00:00+07', '2026-05-15 10:11:30+07', $3, $3)
       RETURNING id`,
      [tenantId, alloc2.id, adminId]
    );

    console.log('[seed-ops] Seeded roast sessions.');

    // 8. Insert Cupping Sessions & Samples
    const { rows: [cup1] } = await client.query(
      `INSERT INTO oec_cupping_sessions (tenant_id, cupping_date, days_off_roast, cupping_purpose, session_notes, early_warning, created_by, updated_by)
       VALUES ($1, '2026-04-20', 2, 'development', 'Sensory evaluation of the first 2026 development sample.', false, $2, $2)
       RETURNING id`,
      [tenantId, adminId]
    );

    await client.query(
      `INSERT INTO oec_cupping_samples (tenant_id, cupping_session_id, roast_session_id, score_aroma, score_flavour, score_acidity, score_body, score_sweetness, score_aftertaste, score_overall, obs_aroma, obs_flavour, obs_acidity, obs_body, obs_sweetness, obs_aftertaste, obs_overall, final_decision, journal_draft, created_by, updated_by)
       VALUES ($1, $2, $3, 8, 8, 8, 8, 9, 8, 8, 'Vibrant floral aroma, jasmine.', 'Clean citrus notes, lime and orange peel.', 'Crisp, bright phosphoric acidity.', 'Silky and medium body.', 'High perceived sweetness, like raw honey.', 'Clean and refreshing aftertaste.', 'Superb early batch. Extremely clean cup.', 'approve', 'Auto-generated sensory notes look solid. Ready for public release.', $4, $4)`,
      [tenantId, cup1.id, rs2.id, adminId]
    );

    console.log('[seed-ops] Seeded cuppings.');

    // 9. Insert Journal Entries dynamically from public.journal_posts
    console.log('[seed-ops] Populating journal entries from public website...');
    const { rows: publicPosts } = await client.query("SELECT * FROM public.journal_posts");

    for (const post of publicPosts) {
      let targetAllocId = alloc2.id;
      let docType = 'field_notes';

      if (post.slug === 'walking-the-estate-march-2026') {
        targetAllocId = alloc2.id;
        docType = 'field_notes';
      } else if (post.slug === 'suan-saket-estate-field-blend') {
        targetAllocId = alloc2.id;
        docType = 'allocation_record';
      } else if (post.slug === 'what-happens-to-the-pulp') {
        targetAllocId = alloc3.id;
        docType = 'field_notes';
      } else if (post.slug === 'first-visit-to-the-estate-march-2025') {
        targetAllocId = alloc1.id;
        docType = 'field_notes';
      } else {
        // Fallback for any other posts to avoid unique conflicts
        continue;
      }

      // Insert into oec_journal_entries
      const { rows: [entry] } = await client.query(
        `INSERT INTO oec_journal_entries (tenant_id, allocation_id, document_type, status, draft_content, published_content, created_by, updated_by, created_at)
         VALUES ($1, $2, $3, 'published', $4, $4, $5, $5, $6)
         RETURNING id`,
        [tenantId, targetAllocId, docType, post.excerpt, adminId, post.created_at]
      );

      // Insert version history
      await client.query(
        `INSERT INTO oec_journal_versions (tenant_id, entry_id, version_number, content, edit_reason, edited_by, edited_at)
         VALUES ($1, $2, 1, $3, 'Initial import from public website', $4, $5)`,
        [tenantId, entry.id, post.excerpt, adminId, post.created_at]
      );
    }

    console.log(`[seed-ops] Populated ${publicPosts.length} journal entries.`);

    await client.query('COMMIT');
    console.log('[seed-ops] Seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed-ops] Seeding failed:', err.message);
  } finally {
    client.release();
  }
}

seedOpsDetails().then(() => process.exit(0));
