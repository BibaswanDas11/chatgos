import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://yxbofwrmutyewqhhxidp.supabase.co";
const supabaseKey = "sb_publishable_KMKcxhxp5NXQswNPrM1ruA_KwG0j2bD";

const supabase = createClient(supabaseUrl, supabaseKey);

const username = document.getElementById("username");
const userid = document.getElementById("userid");
const password = document.getElementById("password");
const signupBtn = document.getElementById("signupBtn");
const idError = document.getElementById("idError");

// check ID uniqueness
userid.addEventListener("input", async () => {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("user_id", userid.value);

  if (data.length > 0) {
    idError.textContent = "User ID already exists";
  } else {
    idError.textContent = "";
  }
});

signupBtn.addEventListener("click", async () => {
  if (idError.textContent !== "") return;

  const { error } = await supabase.from("users").insert({
    username: username.value,
    user_id: userid.value,
    password: password.value,
    dp_url: "",
    status: "online"
  });

  if (!error) {
    localStorage.setItem("user_id", userid.value);
    window.location.href = "chat.html";
  } else {
    alert(error.message);
  }
});
