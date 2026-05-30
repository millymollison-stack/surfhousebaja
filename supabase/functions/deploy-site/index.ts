import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { propertyId, slug } = await req.json();
    if (!propertyId || !slug) throw new Error("Missing propertyId or slug");

    // Verify property belongs to user
    const { data: property } = await supabase
      .from("properties")
      .select("id, owner_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) throw new Error("Property not found");
    if (property.owner_id !== user.id) throw new Error("Not authorized");

    const HOSTINGER_USER = "u805830916";
    const HOSTINGER_HOST = "82.29.86.252";
    const HOSTINGER_PORT = "65002";
    const HOSTINGER_PASS = Deno.env.get("HOSTINGER_SSH_PASS") || "Clawbot12!";
    const REMOTE_BASE = `/home/${HOSTINGER_USER}/domains/propbook.pro/public_html`;
    const REMOTE_TARGET = `${REMOTE_BASE}/props/${slug}`;

    // ─── STEP 1: Create remote directory ────────────────────
    console.log("[deploy-site] STEP 1: Creating remote directory...");
    await runSSH(
      `mkdir -p "${REMOTE_TARGET}" && echo "DIR_OK"`,
      HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
    );

    // ─── STEP 2: Rsync Migration template to Hostinger ───────
    // We store the template on Hostinger already at a known path
    const MIGRATION_TEMPLATE = `${REMOTE_BASE}/_templates/migration`;
    const templateExists = await runSSH(
      `test -d "${MIGRATION_TEMPLATE}" && echo "EXISTS" || echo "MISSING"`,
      HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
    );

    if (templateExists.includes("EXISTS")) {
      console.log("[deploy-site] STEP 2: Rsyncing migration template...");
      await runSSH(
        `rsync -avz -e "sshpass -p '${HOSTINGER_PASS}' ssh -o StrictHostKeyChecking=no -p ${HOSTINGER_PORT}" "${MIGRATION_TEMPLATE}/" "${REMOTE_TARGET}/"`,
        HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
      );
    } else {
      // Fallback: clone from GitHub
      console.log("[deploy-site] STEP 2: Cloning from GitHub...");
      await runSSH(
        `cd "${REMOTE_TARGET}" && git clone git@github.com:millymollison-stack/surfhousebaja.git . 2>&1 || echo "GIT_FALLBACK_OK"`,
        HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
      );
    }

    // ─── STEP 3: Update Home.tsx with new property ID ────────
    console.log("[deploy-site] STEP 3: Updating Home.tsx property ID...");
    const homeUpdate = `sed -i "s/SURF_HOUSE_BAJA_ID = '[^']*'/SURF_HOUSE_BAJA_ID = '${propertyId}'/" pages/Home.tsx`;
    await runSSH(
      `cd "${REMOTE_TARGET}" && ${homeUpdate} && echo "HOME_UPDATED"`,
      HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
    );

    // ─── STEP 4: npm install on Hostinger ────────────────────
    console.log("[deploy-site] STEP 4: npm install...");
    await runSSH(
      `cd "${REMOTE_TARGET}" && npm install 2>&1`,
      HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
    );

    // ─── STEP 5: npm run build on Hostinger ───────────────────
    console.log("[deploy-site] STEP 5: Building React app...");
    await runSSH(
      `cd "${REMOTE_TARGET}/src" && npm run build 2>&1`,
      HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
    );

    // ─── STEP 6: Fix permissions ─────────────────────────────
    console.log("[deploy-site] STEP 6: Fixing permissions...");
    await runSSH(
      `chmod -R 755 "${REMOTE_TARGET}/src/dist" && chmod 644 "${REMOTE_TARGET}/src/dist"/* 2>&1 || echo "PERMS_done"`,
      HOSTINGER_USER, HOSTINGER_HOST, HOSTINGER_PORT, HOSTINGER_PASS
    );

    // ─── STEP 7: Mark property as active ────────────────────
    await supabase
      .from("properties")
      .update({
        status: "active",
        site_url: `https://propbook.pro/props/${slug}`,
        server_ip: HOSTINGER_HOST,
        folder_path: REMOTE_TARGET,
      })
      .eq("id", propertyId);

    const siteUrl = `https://propbook.pro/props/${slug}`;
    console.log(`[deploy-site] ✅ Deploy complete: ${siteUrl}`);

    return new Response(
      JSON.stringify({ success: true, siteUrl, slug, propertyId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[deploy-site] ❌ Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── SSH helper ───────────────────────────────────────────────────────────────
async function runSSH(
  cmd: string,
  user: string,
  host: string,
  port: string,
  pass: string
): Promise<string> {
  const fullCmd = [
    "sshpass",
    `-p '${pass}'`,
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=10",
    "-p", port,
    `${user}@${host}`,
    `"${cmd.replace(/"/g, '\\"')}"`,
  ].join(" ");

  const proc = Deno.run({
    cmd: fullCmd.split(" "),
    stdout: "piped",
    stderr: "piped",
  });
  const [stdout, stderr] = await Promise.all([proc.output(), proc.stderrOutput()]);
  const status = await proc.status();
  if (!status.success) {
    const errMsg = new TextDecoder().decode(stderr);
    throw new Error(`SSH failed (${status.code}): ${errMsg}`);
  }
  return new TextDecoder().decode(stdout).trim();
}
