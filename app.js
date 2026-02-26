const SUPABASE_URL = "https://yxbofwrmutyewqhhxidp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4Ym9md3JtdXR5ZXdxaGh4aWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5Mzg2NDksImV4cCI6MjA4NzUxNDY0OX0.T6vVHthMAedGa0wa-F7PkM82IY7BC9aW0pvYFzgLRHU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");

if (signupBtn) {
  signupBtn.onclick = async () => {
    const id = document.getElementById("userId").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorEl = document.getElementById("idError");

    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      errorEl.textContent = "Only letters and numbers allowed";
      return;
    }

    const { data: existing } = await supabaseClient
      .from("users")
      .select("id")
      .eq("id", id);

    if (existing.length > 0) {
      errorEl.textContent = "User ID already exists";
      return;
    }

    await supabaseClient.from("users").insert([{ id, password }]);
    localStorage.setItem("chatgos_user", id);
    window.location.href = "chat.html";
  };
}

if (loginBtn) {
  loginBtn.onclick = async () => {
    const id = document.getElementById("userId").value.trim();
    const password = document.getElementById("password").value.trim();

    const { data } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", id)
      .eq("password", password);

    if (data.length === 1) {
      localStorage.setItem("chatgos_user", id);
      window.location.href = "chat.html";
    } else {
      alert("Invalid credentials");
    }
  };
      }
