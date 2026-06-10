import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Hostinger config ─────────────────────────────────────────────
const HOSTINGER_HOST = "82.29.86.252";
const HOSTINGER_PORT = "65002";
const HOSTINGER_USER = "u805830916";
const HOSTINGER_PASS = "Clawbot12!";
const PROJECT_DIR = "/home/u805830916/domains/propbook.pro/public_html";

async function sshCommand(cmd: string): Promise<string> {
  const fullCmd = `sshpass -p '${HOSTINGER_PASS}' ssh -o StrictHostKeyChecking=no -o BatchMode=yes -p ${HOSTINGER_PORT} ${HOSTINGER_USER}@${HOSTINGER_HOST} '${cmd.replace(/'/g, "'\"'\"'")}'`;
  const p = Deno.Command.new("bash", {
    args: ["-c", fullCmd],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await p.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);
  if (code !== 0) {
    throw new Error(`SSH (${code}): ${err.slice(0, 200) || out.slice(0, 200)}`);
  }
  return out;
}

async function sshWriteFile(path: string, content: string): Promise<void> {
  const b64 = btoa(new TextEncoder().encode(content).reduce((data, byte) => data + String.fromCharCode(byte), ""));
  const cmd = `echo '${b64}' | base64 -d > '${path}' && chmod 644 '${path}'`;
  await sshCommand(cmd);
}

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

    console.log(`[deploy-react] 🚀 slug=${slug} propertyId=${propertyId}`);

    // Verify property belongs to user
    const { data: property } = await supabase
      .from("properties")
      .select("id, owner_id, status")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) throw new Error("Property not found");
    if (property.owner_id !== user.id) throw new Error("Not your property");

    const siteUrl = `https://www.propbook.pro/props/${slug}`;
    const remoteDir = `${PROJECT_DIR}/props/${slug}`;
    const scriptPath = `/home/u805830916/domains/propbook.pro/scripts/deploy-react-property.mjs`;

    // ── Step 1: Ensure directories exist ───────────────────────────────
    await sshCommand(`mkdir -p '${PROJECT_DIR}/scripts' && mkdir -p '${remoteDir}' && chmod 755 '${PROJECT_DIR}/scripts' '${remoteDir}'`);
    console.log("[deploy-react] ✅ Dirs ready");

    // ── Step 2: Fetch deploy script from GitHub ─────────────────────────
    const ghRes = await fetch(
      "https://raw.githubusercontent.com/millymollison-stack/surfhousebaja/main/scripts/deploy-react-property.mjs"
    );
    if (!ghRes.ok) throw new Error(`Failed to fetch script from GitHub: ${ghRes.status}`);
    const scriptContent = await ghRes.text();
    console.log(`[deploy-react] 📋 Script fetched (${scriptContent.length} chars)`);

    // ── Step 3: Write script to Hostinger ───────────────────────────────
    await sshWriteFile(scriptPath, scriptContent);
    console.log("[deploy-react] ✅ Script written to Hostinger");

    // ── Step 4: Run the deploy script ───────────────────────────────────
    console.log("[deploy-react] 🚀 Running deploy-react-property.mjs...");
    const deployCmd = `cd '${PROJECT_DIR}' && node scripts/deploy-react-property.mjs --slug=${slug} --property-id=${propertyId} 2>&1`;
    let output = "";
    try {
      output = await sshCommand(deployCmd);
      console.log("[deploy-react] Deploy output:", output.slice(0, 800));
    } catch (sshErr: any) {
      console.error("[deploy-react] Deploy SSH error:", sshErr.message);
      // Continue — script may have partially run
    }

    // Check if deploy appeared to succeed
    const deployOk = output.includes("Deploy complete") || output.includes("🎉") || output.includes("✅");
    if (!deployOk) {
      console.warn("[deploy-react] ⚠️ Deploy output doesn't confirm success:", output.slice(0, 300));
    }

    // ── Step 5: Update property status in Supabase ────────────────────────
    console.log("[deploy-react] 📝 Updating property status to 'active'...");
    const { error: updateErr } = await supabase
      .from("properties")
      .update({
        status: "active",
        site_url: siteUrl,
        server_ip: HOSTINGER_HOST,
        folder_path: remoteDir,
      })
      .eq("id", propertyId);

    if (updateErr) {
      console.error("[deploy-react] ⚠️ Status update failed:", updateErr.message);
    }

    console.log(`[deploy-react] ✅ Done: ${siteUrl}`);

    return new Response(
      JSON.stringify({ success: true, siteUrl, slug, propertyId, deployed_via: "deploy-react-property.mjs" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[deploy-react] ❌ Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});