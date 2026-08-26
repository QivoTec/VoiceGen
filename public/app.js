(function() {
  // ── CONFIG ──
  var FC = {
    apiKey: "AIzaSyAU32QyPM-GE6EGmKBZvzVukFI8Mn4zpkc",
    authDomain: "voicegen-11174.firebaseapp.com",
    projectId: "voicegen-11174",
    storageBucket: "voicegen-11174.firebasestorage.app",
    messagingSenderId: "823672984612",
    appId: "1:823672984612:web:7a3a57d0d853851ed3b4b1"
  };
  var MK = "sk-cp-bksrN1xaAxbb5PVvAFj2Eg2TbFzSH4KIS1VQiFOmBJGEm0u8-c6khKGySWKZEhp11ldbX0pf5x6NsSJfezfCkkAWmTQEMnM7NXuqGLn2HesAkuUQYpb00zM";
  var BACKEND = window.location.origin;

  firebase.initializeApp(FC);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var user = null;
  var userCredits = 0;
  var userVirtualAccounts = [];
  var userReferralCode = "";
  var userReferralEarnings = 0;
  var userReferralCount = 0;
  var history = [];
  var cloned = [];
  var selectedVoice = "Orion";
  var selectedClonedVoice = null;
  var currentCryptoPayment = null;
  var selectedCryptoPkg = { usd: 5, credits: 50000 };
  var withdrawCurrency = "NGN";
  var liveUsdRate = 0;
  var accountVerified = false;
  var verifyTimer = null;
  var isDark = localStorage.getItem("vg-theme") === "dark";
  var previewCache = {};

  var pageTitles = {
    generate: ["Text to Speech", "Paste your script and pick a voice"],
    clone: ["Clone Voices", "Upload a sample to create your custom voice"],
    history: ["Generation History", "Your past voiceover generations"],
    topup: ["Buy Credits with Transfer", "Top up your account via bank transfer"],
    crypto: ["Buy Credits with Crypto", "Pay with USDT — instant global payments"],
    referral: ["Referral Program", "Earn 5% lifetime commission on every referral"]
  };

  var voices = [
    { name:"Orion", meta:"Deep · Male", id:"male-qn-qingse" },
    { name:"Elliot", meta:"Gentle · Male", id:"male-qn-jingying" },
    { name:"Yuki", meta:"Bright · Female", id:"female-shaonv" },
    { name:"Solène", meta:"Warm · Female", id:"female-yujie" },
    { name:"Atlas", meta:"Cinematic · Male", id:"male-qn-badao" },
    { name:"Narrator", meta:"Audiobook · Male", id:"presenter_male" },
    { name:"Broadcast", meta:"Podcast · Male", id:"audiobook_male_1" },
    { name:"Aria", meta:"Professional · Female", id:"audiobook_female_1" },
    { name:"Marcus", meta:"Story · Male", id:"audiobook_male_2" },
    { name:"Luna", meta:"Story · Female", id:"audiobook_female_2" }
  ];

  function $(id) { return document.getElementById(id); }

  function showStatus(msg, type) {
    var el = $("vg-status");
    el.textContent = msg;
    el.className = "vg-status show" + (type === "err" ? " err" : type === "ok" ? " ok" : "");
    setTimeout(function() { el.className = "vg-status"; }, 3500);
  }

  async function getToken() {
    return await user.getIdToken(true);
  }

  // ── AUTH ──
  $("vg-signinbtn").onclick = function() {
    var email = $("vg-auth-email").value.trim();
    var pass = $("vg-auth-password").value;
    if (!email || !pass) { showStatus("Please enter email and password", "err"); return; }
    auth.signInWithEmailAndPassword(email, pass).catch(function(e) {
      showStatus("Sign-in failed: " + e.message, "err");
    });
  };

  $("vg-signupbtn").onclick = function() {
    var email = $("vg-auth-email").value.trim();
    var pass = $("vg-auth-password").value;
    if (!email || !pass) { showStatus("Please enter email and password", "err"); return; }
    if (pass.length < 6) { showStatus("Password must be at least 6 characters", "err"); return; }
    auth.createUserWithEmailAndPassword(email, pass).catch(function(e) {
      showStatus("Sign-up failed: " + e.message, "err");
    });
  };

  $("vg-resetbtn").onclick = function() {
    var email = $("vg-auth-email").value.trim();
    if (!email) { showStatus("Enter your email address first", "err"); return; }
    auth.sendPasswordResetEmail(email).then(function() {
      showStatus("Password reset email sent!", "ok");
    }).catch(function(e) { showStatus("Error: " + e.message, "err"); });
  };

  // Press Enter to sign in
  $("vg-auth-password").addEventListener("keypress", function(e) {
    if (e.key === "Enter") $("vg-signinbtn").click();
  });

  $("vg-signout").onclick = function() { auth.signOut(); };

  auth.onAuthStateChanged(function(u) {
    user = u;
    if (u) {
      $("vg-land").style.display = "none";
      $("vg-app").style.display = "block";
      $("vg-uname").textContent = u.displayName || u.email.split("@")[0];
      $("vg-uemail").textContent = u.email;
      if (u.photoURL) $("vg-avatar").src = u.photoURL;
      setupAccount(u);
      loadHistory();
      loadCloned();
      applyTheme();
      renderVoices();
    } else {
      $("vg-land").style.display = "flex";
      $("vg-app").style.display = "none";
    }
  });

  async function setupAccount(u) {
    try {
      var refCode = localStorage.getItem("vg-ref") || "";
      var token = await u.getIdToken(true);
      var res = await fetch(BACKEND + "/api/setup-account", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ refCode: refCode })
      });
      var data = await res.json();
      if (data.success) {
        userCredits = data.data.credits || 0;
        userVirtualAccounts = data.data.virtualAccount || [];
        userReferralCode = data.data.referralCode || "";
        userReferralEarnings = data.data.referralEarningsNGN || 0;
        userReferralCount = data.data.referralCount || 0;
        renderCreditsBar();
        if (refCode) localStorage.removeItem("vg-ref");
      } else {
        setTimeout(function() { setupAccount(u); }, 3000);
      }
    } catch(e) {
      console.warn("Setup error:", e);
      setTimeout(function() { setupAccount(u); }, 5000);
    }
    loadBalance();
  }

  async function loadBalance() {
    try {
      var token = await getToken();
      var res = await fetch(BACKEND + "/api/balance", { headers: { "Authorization": "Bearer " + token } });
      var data = await res.json();
      userCredits = data.credits || 0;
      userVirtualAccounts = data.virtualAccount || [];
      userReferralCode = data.referralCode || "";
      userReferralEarnings = data.referralEarningsNGN || 0;
      userReferralCount = data.referralCount || 0;
      renderCreditsBar();
      var bc = $("vg-big-credits");
      if (bc) bc.textContent = userCredits.toLocaleString();
    } catch(e) { console.warn("Balance error:", e); }
  }

  function renderCreditsBar() {
    var d = $("vg-credits-display");
    if (d) d.textContent = userCredits.toLocaleString() + " credits";
    var bar = $("vg-credits-bar");
    if (bar) bar.style.width = Math.min(100, (userCredits / 50000) * 100) + "%";
  }

  // ── THEME ──
  function applyTheme() {
    var body = document.body;
    if (isDark) {
      body.classList.add("dark-mode");
      var icon = $("vg-theme-icon"); if (icon) icon.textContent = "☀️";
      var lbl = $("vg-theme-label"); if (lbl) lbl.textContent = "Light";
      var bc = $("vg-big-credits"); if (bc) bc.style.color = "#f0ece0";
    } else {
      body.classList.remove("dark-mode");
      var icon2 = $("vg-theme-icon"); if (icon2) icon2.textContent = "🌙";
      var lbl2 = $("vg-theme-label"); if (lbl2) lbl2.textContent = "Dark";
      var bc2 = $("vg-big-credits"); if (bc2) bc2.style.color = "#1a1a1a";
    }
  }
  window.toggleTheme = function() {
    isDark = !isDark;
    localStorage.setItem("vg-theme", isDark ? "dark" : "light");
    applyTheme();
  };
  applyTheme();

  // ── TABS ──
  window.switchTab = function(tab) {
    document.querySelectorAll(".vg-sb-item").forEach(function(b) { b.classList.remove("active"); });
    document.querySelectorAll(".vg-tc").forEach(function(c) { c.classList.remove("active"); });
    var btn = document.querySelector('[data-tab="' + tab + '"]');
    if (btn) btn.classList.add("active");
    var tc = $("vg-tc-" + tab);
    if (tc) tc.classList.add("active");
    var info = pageTitles[tab] || ["VoiceGen", ""];
    $("vg-pagetitle").textContent = info[0];
    $("vg-pagesub").textContent = info[1];
    if (tab === "history") { loadHistory().then(renderHistory); }
    if (tab === "topup") renderTopup();
    if (tab === "referral") { renderReferralTab(); fetchLiveRate(); }
    $("vg-sidebar").classList.remove("open");
    $("vg-overlay").classList.remove("show");
  };

  document.querySelectorAll(".vg-sb-item[data-tab]").forEach(function(btn) {
    btn.onclick = function() { switchTab(btn.dataset.tab); };
  });

  // Hamburger
  $("vg-hamburger").onclick = function() {
    $("vg-sidebar").classList.toggle("open");
    $("vg-overlay").classList.toggle("show");
  };
  $("vg-overlay").onclick = function() {
    $("vg-sidebar").classList.remove("open");
    $("vg-overlay").classList.remove("show");
  };

  // ── VOICES ──
  function renderVoices() {
    var g = $("vg-vgrid");
    if (!g) return;
    var allVoices = voices.slice();
    cloned.forEach(function(v) {
      allVoices.push({ name: v.name, meta: "Cloned · Custom", id: v.vid, isCloned: true });
    });
    g.innerHTML = "";
    allVoices.forEach(function(v) {
      var c = document.createElement("div");
      c.className = "vg-vcard" + (v.name === selectedVoice ? " sel" : "");
      c.innerHTML = '<div class="vg-vname">' + v.name + '</div><div class="vg-vmeta">' + v.meta + '</div><div class="vg-vdot"></div>' +
        (!v.isCloned ? '<button class="vg-vprev" onclick="previewVoice(\'' + v.id + '\',\'' + v.name + '\',event)">▶</button>' : '');
      c.onclick = function(e) {
        if (e.target.classList.contains("vg-vprev")) return;
        document.querySelectorAll(".vg-vcard").forEach(function(x) { x.classList.remove("sel"); });
        c.classList.add("sel");
        selectedVoice = v.name;
        if (v.isCloned) { selectedClonedVoice = v.id; } else { selectedClonedVoice = null; }
      };
      g.appendChild(c);
    });
  }

  window.previewVoice = async function(vid, vname, e) {
    e.stopPropagation();
    if (previewCache[vid]) { new Audio(previewCache[vid]).play(); return; }
    showStatus("Loading preview...", "");
    try {
      var res = await fetch("https://api.minimaxi.chat/v1/t2a_v2", {
        method: "POST",
        headers: { "Authorization": "Bearer " + MK, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "speech-01-hd", text: "Hello, this is " + vname + ". I am your AI voiceover assistant.", voice_setting: { voice_id: vid, speed: 1.0, vol: 1.0, pitch: 0 }, audio_setting: { audio_sample_rate: 32000, bitrate: 128000, format: "mp3" } })
      });
      var data = await res.json();
      if (data.data && data.data.audio) {
        var url = "data:audio/mp3;base64," + data.data.audio;
        previewCache[vid] = url;
        new Audio(url).play();
      }
    } catch(ex) { showStatus("Preview failed", "err"); }
  };

  // ── GENERATION ──
  var speed = 1.0;
  $("vg-speed").oninput = function() { speed = parseFloat(this.value); $("vg-speedval").textContent = speed.toFixed(1) + "×"; };
  $("vg-script").oninput = function() { $("vg-chars").textContent = this.value.length + " / 30,000"; };

  function chunkText(text, maxLen) {
    if (text.length <= maxLen) return [text];
    var chunks = [], sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    var current = "";
    sentences.forEach(function(s) {
      if ((current + s).length > maxLen && current) { chunks.push(current.trim()); current = ""; }
      current += s;
    });
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  function mergeUint8Arrays(arrays) {
    var total = arrays.reduce(function(n, a) { return n + a.length; }, 0);
    var out = new Uint8Array(total);
    var offset = 0;
    arrays.forEach(function(a) { out.set(a, offset); offset += a.length; });
    return out;
  }

  $("vg-genbtn").onclick = async function() {
    var text = $("vg-script").value.trim();
    if (!text) { showStatus("Please enter your script", "err"); return; }
    if (!selectedVoice) { showStatus("Please select a voice", "err"); return; }
    var cost = text.length;
    if (userCredits < cost) { showStatus("Insufficient credits — need " + cost + ", have " + userCredits, "err"); return; }

    var btn = $("vg-genbtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="vg-spinner"></span> Generating...';

    try {
      var token = await getToken();
      var deductRes = await fetch(BACKEND + "/api/deduct-credits", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ characters: cost, voiceName: selectedVoice })
      });
      var deductData = await deductRes.json();
      if (!deductData.success) { showStatus(deductData.error || "Credit deduction failed", "err"); return; }
      userCredits = deductData.remaining;
      renderCreditsBar();

      var vid = selectedClonedVoice || voices.find(function(v) { return v.name === selectedVoice; })?.id || "male-qn-qingse";
      var chunks = chunkText(text, 4800);
      var audioBuffers = [];

      for (var i = 0; i < chunks.length; i++) {
        showStatus("Generating part " + (i+1) + " of " + chunks.length + "...", "");
        var r = await fetch("https://api.minimaxi.chat/v1/t2a_v2", {
          method: "POST",
          headers: { "Authorization": "Bearer " + MK, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "speech-01-hd", text: chunks[i], voice_setting: { voice_id: vid, speed: speed, vol: 1.0, pitch: 0 }, audio_setting: { audio_sample_rate: 32000, bitrate: 128000, format: "mp3" } })
        });
        var d = await r.json();
        if (d.data && d.data.audio) {
          var bytes = Uint8Array.from(atob(d.data.audio), function(c) { return c.charCodeAt(0); });
          audioBuffers.push(bytes);
        }
      }

      var merged = mergeUint8Arrays(audioBuffers);
      var blob = new Blob([merged], { type: "audio/mp3" });
      var url = URL.createObjectURL(blob);
      var player = $("vg-player");
      player.src = url;
      var audiores = $("vg-audiores");
      audiores.className = "vg-audiores show";
      player.play();

      var dlBtn = $("vg-dlbtn");
      dlBtn.onclick = function() {
        var a = document.createElement("a");
        a.href = url;
        a.download = "voicegen_" + selectedVoice + ".mp3";
        a.click();
      };

      await saveHistory(text, selectedVoice, url);
      showStatus("Voiceover ready!", "ok");
    } catch(e) {
      showStatus("Generation failed: " + e.message, "err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = "▶ Generate Voiceover";
    }
  };

  // ── HISTORY ──
  async function saveHistory(text, vname, url) {
    if (!user) return;
    try {
      var audioData = url;
      if (url && url.startsWith("blob:")) {
        var resp = await fetch(url);
        var blob = await resp.blob();
        audioData = await new Promise(function(resolve) {
          var reader = new FileReader();
          reader.onloadend = function() { resolve(reader.result); };
          reader.readAsDataURL(blob);
        });
      }
      var entry = { text: text.slice(0, 300), voiceName: vname, audioData: audioData, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
      await db.collection("users").doc(user.uid).collection("history").add(entry);
      history.unshift({ text: entry.text, voiceName: vname, audioUrl: audioData, createdAt: new Date() });
    } catch(e) { console.warn("History save failed:", e); }
  }

  async function loadHistory() {
    if (!user) return;
    try {
      var snap = await db.collection("users").doc(user.uid).collection("history").orderBy("createdAt", "desc").limit(50).get();
      history = snap.docs.map(function(d) {
        var data = d.data();
        return { id: d.id, text: data.text || "", voiceName: data.voiceName || "", audioUrl: data.audioData || data.audioUrl || "", createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : new Date() };
      });
    } catch(e) { console.warn("History load failed:", e); }
  }

  function renderHistory() {
    var list = $("vg-hlist");
    if (!history.length) { list.innerHTML = '<div class="vg-empty"><div class="big">♪</div><p>No generations yet.</p></div>'; return; }
    list.innerHTML = history.map(function(item, i) {
      var audio = item.audioUrl || "";
      return '<div class="vg-hitem"><div class="vg-hicon">♪</div><div class="vg-hinfo"><div class="vg-htxt">' + item.text + '</div><div class="vg-hmeta">' + item.voiceName + ' · ' + (item.createdAt ? item.createdAt.toLocaleDateString() : "Recently") + '</div></div>' +
        (audio ? '<button class="vg-hact" onclick="new Audio(\'' + audio.slice(0, 50) + '\').play()" title="Play">▶</button>' : '') +
        (audio ? '<a class="vg-hact" href="' + audio + '" download="voicegen_' + i + '.mp3" title="Download">↓</a>' : '') +
        '</div>';
    }).join("");
  }

  window.vgPlay = function(i) { var a = history[i] && history[i].audioUrl; if (a) new Audio(a).play(); };

  // ── CLONE ──
  $("vg-uploadzone").onclick = function() { $("vg-clonefile").click(); };
  $("vg-clonefile").onchange = function() {
    if (this.files[0]) $("vg-clonefn").textContent = this.files[0].name;
  };

  $("vg-clonebtn").onclick = async function() {
    var file = $("vg-clonefile").files[0];
    var name = $("vg-clonename").value.trim();
    if (!file) { showStatus("Please upload an audio file", "err"); return; }
    if (!name) { showStatus("Please enter a voice name", "err"); return; }
    var btn = $("vg-clonebtn");
    btn.disabled = true; btn.textContent = "Cloning...";
    try {
      var formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "voice_clone");
      var uploadRes = await fetch("https://api.minimaxi.chat/v1/files/upload", {
        method: "POST",
        headers: { "Authorization": "Bearer " + MK },
        body: formData
      });
      var uploadData = await uploadRes.json();
      var fileId = uploadData.file?.file_id;
      if (!fileId) throw new Error("Upload failed");
      var cloneRes = await fetch("https://api.minimaxi.chat/v1/voice_clone", {
        method: "POST",
        headers: { "Authorization": "Bearer " + MK, "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, voice_id: "clone_" + Date.now(), name: name })
      });
      var cloneData = await cloneRes.json();
      var vid = cloneData.voice_id || "clone_" + Date.now();
      var newVoice = { name: name, vid: vid, createdAt: new Date() };
      await db.collection("users").doc(user.uid).collection("cloned").add(newVoice);
      cloned.unshift(newVoice);
      renderCloned();
      renderVoices();
      showStatus("Voice cloned successfully!", "ok");
      $("vg-clonename").value = "";
      $("vg-clonefn").textContent = "No file selected";
    } catch(e) { showStatus("Clone failed: " + e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "Clone Voice"; }
  };

  async function loadCloned() {
    if (!user) return;
    try {
      var snap = await db.collection("users").doc(user.uid).collection("cloned").orderBy("createdAt", "desc").get();
      cloned = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    } catch(e) { console.warn("Cloned load failed:", e); }
  }

  function renderCloned() {
    var list = $("vg-clonedlist");
    if (!cloned.length) { list.innerHTML = '<div class="vg-empty"><div class="big">🎙</div><p>No cloned voices yet.<br><small style="color:#bbb;">Cloned voices appear in Text to Speech.</small></p></div>'; return; }
    list.innerHTML = cloned.map(function(v) {
      return '<div class="vg-cloneditem"><div style="width:36px;height:36px;background:linear-gradient(135deg,#1a1a1a,#333);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#c9a84c;font-size:16px;flex-shrink:0;">🎙</div><div class="nm">' + v.name + '<div style="font-size:11px;color:#bbb;margin-top:2px;">Cloned · Custom</div></div><button class="vg-usebtn" onclick="vgUseCloned(\'' + v.vid + '\',\'' + v.name + '\')">Use in TTS</button></div>';
    }).join("");
  }

  window.vgUseCloned = function(vid, vname) {
    selectedVoice = vname;
    selectedClonedVoice = vid;
    switchTab("generate");
    renderVoices();
    showStatus("Voice selected: " + vname, "ok");
  };

  // ── TOPUP ──
  function renderTopup() {
    var list = $("vg-va-list");
    if (!list) return;
    var bc = $("vg-big-credits");
    if (bc) bc.textContent = userCredits.toLocaleString();
    if (!userVirtualAccounts || !userVirtualAccounts.length) {
      list.innerHTML = '<div style="text-align:center;color:#bbb;font-size:13px;padding:20px;">No virtual account yet. Please wait a moment and refresh.</div>';
      return;
    }
    list.innerHTML = userVirtualAccounts.map(function(a) {
      return '<div style="background:#fff;border:1.5px solid #e8d5a0;border-radius:8px;padding:14px;margin-bottom:10px;">' +
        '<div style="font-size:12px;color:#888;margin-bottom:4px;">' + (a.bankName || "Bank") + '</div>' +
        '<div style="font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:0.05em;margin-bottom:2px;">' + (a.accountNumber || "—") + '</div>' +
        '<div style="font-size:12px;color:#888;">' + (a.accountName || "") + '</div>' +
        '</div>';
    }).join("");
  }

  window.switchToTopup = function() { switchTab("topup"); };

  // ── CRYPTO ──
  document.querySelectorAll(".crypto-pkg").forEach(function(pkg) {
    pkg.onclick = function() {
      document.querySelectorAll(".crypto-pkg").forEach(function(p) { p.style.border = "1.5px solid #ebebeb"; p.style.background = ""; });
      this.style.border = "2px solid #c9a84c"; this.style.background = "#fffdf7";
      selectedCryptoPkg = { usd: parseFloat(this.dataset.usd), credits: parseInt(this.dataset.credits) };
    };
  });

  window.initCryptoPayment = async function() {
    var btn = $("crypto-pay-btn");
    btn.disabled = true; btn.innerHTML = '<span class="vg-spinner"></span> Creating payment...';
    try {
      var token = await getToken();
      var res = await fetch(BACKEND + "/api/create-crypto-payment", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ amountUSD: selectedCryptoPkg.usd, creditsAmount: selectedCryptoPkg.credits })
      });
      var data = await res.json();
      if (data.success) {
        currentCryptoPayment = data;
        $("crypto-amount-display").textContent = data.payAmount + " " + (data.payCurrency || "USDT").toUpperCase();
        $("crypto-address-display").textContent = data.payAddress;
        $("crypto-payment-box").style.display = "block";
        $("crypto-payment-box").scrollIntoView({ behavior: "smooth" });
        showStatus("Send exactly " + data.payAmount + " USDT", "ok");
      } else { throw new Error(data.error || "Payment creation failed"); }
    } catch(e) { showStatus("Error: " + e.message, "err"); }
    finally { btn.disabled = false; btn.innerHTML = "Pay with USDT"; }
  };

  window.copyCryptoAddress = function() {
    var addr = $("crypto-address-display").textContent;
    navigator.clipboard.writeText(addr).then(function() { showStatus("Address copied!", "ok"); });
  };

  window.cancelCryptoPayment = function() { currentCryptoPayment = null; $("crypto-payment-box").style.display = "none"; };
  window.checkCryptoStatus = async function() { await loadBalance(); showStatus("Balance refreshed", "ok"); };

  // ── REFERRAL ──
  function getReferralLink() { return window.location.origin + "/?ref=" + userReferralCode; }
  window.copyRefLink = function() {
    navigator.clipboard.writeText(getReferralLink()).then(function() { showStatus("Referral link copied!", "ok"); });
  };

  function renderReferralTab() {
    var el = $("ref-link-display");
    if (el) {
      if (userReferralCode) { el.textContent = getReferralLink(); el.style.color = ""; }
      else { el.textContent = "Generating your link..."; el.style.color = "#bbb"; loadBalance(); }
    }
    var cnt = $("ref-count-display"); if (cnt) cnt.textContent = userReferralCount || 0;
    var earn = $("ref-earnings-display"); if (earn) earn.textContent = "₦" + (userReferralEarnings || 0).toLocaleString();
    var bal = $("ref-balance-display"); if (bal) bal.textContent = "₦" + (userReferralEarnings || 0).toLocaleString();
    loadReferralEarnings();
  }

  async function loadReferralEarnings() {
    var list = $("ref-earnings-list"); if (!list) return;
    try {
      var token = await getToken();
      var res = await fetch(BACKEND + "/api/referral-earnings", { headers: { "Authorization": "Bearer " + token } });
      var data = await res.json();
      var earnings = data.earnings || [];
      if (!earnings.length) { list.innerHTML = '<div class="vg-empty"><div class="big">💰</div><p>No earnings yet.</p></div>'; return; }
      list.innerHTML = earnings.map(function(e) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0;"><div style="width:36px;height:36px;background:#e8f8f0;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">💰</div><div style="flex:1;"><div style="font-size:13px;font-weight:500;color:#1a1a1a;">' + (e.note || "") + '</div><div style="font-size:11px;color:#bbb;margin-top:2px;">' + (e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "") + '</div></div><div style="font-size:14px;font-weight:700;color:#27ae60;">+₦' + (e.amountNGN || 0).toLocaleString() + '</div></div>';
      }).join("");
    } catch(e) { list.innerHTML = '<div class="vg-empty"><p>Failed to load.</p></div>'; }
  }

  // ── LIVE RATE ──
  async function fetchLiveRate() {
    try {
      var res = await fetch("https://open.er-api.com/v6/latest/USD");
      var data = await res.json();
      if (data.rates && data.rates.NGN) {
        liveUsdRate = data.rates.NGN;
        var el = $("wd-rate-display"); if (el) el.textContent = "Live rate: $1 = ₦" + liveUsdRate.toLocaleString();
        updateUsdEquiv();
        var usdEl = $("ref-balance-usd"); if (usdEl && liveUsdRate > 0) usdEl.textContent = "≈ $" + (userReferralEarnings / liveUsdRate).toFixed(2) + " USD";
      }
    } catch(e) { liveUsdRate = 1600; }
  }

  function updateUsdEquiv() {
    var amt = parseFloat($("wd-amount")?.value) || 0;
    var el = $("wd-amount-equiv"); if (!el) return;
    if (withdrawCurrency === "NGN" && liveUsdRate > 0 && amt > 0) el.textContent = "≈ $" + (amt / liveUsdRate).toFixed(2) + " USD";
    else if (withdrawCurrency === "USD" && liveUsdRate > 0 && amt > 0) el.textContent = "≈ ₦" + (amt * liveUsdRate).toLocaleString() + " NGN";
    else el.textContent = "";
  }
  document.addEventListener("input", function(e) { if (e.target.id === "wd-amount") updateUsdEquiv(); });

  // ── WITHDRAWAL CURRENCY TOGGLE ──
  window.setWithdrawCurrency = function(c) {
    withdrawCurrency = c;
    var ngnBtn = $("wd-ngn-btn"), usdBtn = $("wd-usd-btn");
    var ngnFields = $("wd-ngn-fields"), usdFields = $("wd-usd-fields");
    if (c === "NGN") {
      ngnBtn.style.background = "#c9a84c"; ngnBtn.style.color = "#111"; ngnBtn.style.borderColor = "#c9a84c";
      usdBtn.style.background = "transparent"; usdBtn.style.color = "#888"; usdBtn.style.borderColor = "#ebebeb";
      ngnFields.style.display = "block"; usdFields.style.display = "none";
      $("wd-amount-label").textContent = "Amount (₦)";
      $("wd-amount").placeholder = "Min ₦10,000";
      $("wd-note").textContent = "⏱ Withdrawals processed within 20 hours.";
      accountVerified = false; $("wd-btn").disabled = true; $("wd-btn").style.opacity = "0.4";
    } else {
      usdBtn.style.background = "#c9a84c"; usdBtn.style.color = "#111"; usdBtn.style.borderColor = "#c9a84c";
      ngnBtn.style.background = "transparent"; ngnBtn.style.color = "#888"; ngnBtn.style.borderColor = "#ebebeb";
      ngnFields.style.display = "none"; usdFields.style.display = "block";
      $("wd-amount-label").textContent = "Amount in Naira (converts to USDT)";
      $("wd-amount").placeholder = "Enter NGN amount to convert";
      $("wd-note").textContent = "⏱ USDT sent to your wallet within 20 hours at live rate.";
      $("wd-btn").disabled = false; $("wd-btn").style.opacity = "1";
    }
    updateUsdEquiv();
  };

  // ── BANK VERIFICATION ──
  window.onBankChange = function() {
    accountVerified = false; $("wd-btn").disabled = true; $("wd-btn").style.opacity = "0.4";
    if ($("wd-acct-num").value.trim().length === 10) verifyAccount();
  };

  window.onAccountNumberInput = function() {
    accountVerified = false; $("wd-btn").disabled = true; $("wd-btn").style.opacity = "0.4";
    $("wd-acct-name").value = "";
    $("wd-acct-name-text").textContent = "Auto-filled after verification";
    $("wd-acct-name-text").style.color = "#bbb";
    clearTimeout(verifyTimer);
    if ($("wd-acct-num").value.trim().length === 10) verifyTimer = setTimeout(verifyAccount, 800);
  };

  async function verifyAccount() {
    var bankCode = $("wd-bank").value;
    var acctNum = $("wd-acct-num").value.trim();
    if (!bankCode || acctNum.length !== 10) return;
    $("wd-verify-spinner").style.display = "inline-block";
    $("wd-acct-name-text").textContent = "Verifying...";
    try {
      var token = await getToken();
      var res = await fetch(BACKEND + "/api/verify-account", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode: bankCode, accountNumber: acctNum })
      });
      var data = await res.json();
      if (data.success && data.accountName) {
        $("wd-acct-name").value = data.accountName;
        $("wd-acct-name-text").textContent = "✓ " + data.accountName;
        $("wd-acct-name-text").style.color = "#27ae60";
        $("wd-acct-name-display").style.borderColor = "#27ae60";
        accountVerified = true; $("wd-btn").disabled = false; $("wd-btn").style.opacity = "1";
      } else { throw new Error(data.error || "Not found"); }
    } catch(e) {
      $("wd-acct-name-text").textContent = "✗ " + e.message;
      $("wd-acct-name-text").style.color = "#e74c3c";
      $("wd-acct-name-display").style.borderColor = "#e74c3c";
      accountVerified = false; $("wd-btn").disabled = true; $("wd-btn").style.opacity = "0.4";
    } finally { $("wd-verify-spinner").style.display = "none"; }
  }

  window.requestWithdrawal = async function() {
    var amount = parseFloat($("wd-amount").value);
    if (!amount || amount < 10000) { showStatus("Minimum withdrawal is ₦10,000", "err"); return; }
    if (amount > userReferralEarnings) { showStatus("Insufficient referral balance", "err"); return; }
    var btn = $("wd-btn");
    btn.disabled = true; btn.style.opacity = "0.6"; btn.textContent = "Processing...";
    try {
      var token = await getToken();
      var payload = { amount: amount, currency: withdrawCurrency };
      if (withdrawCurrency === "NGN") {
        if (!accountVerified) { showStatus("Please verify your bank account first", "err"); return; }
        var bankSelect = $("wd-bank");
        payload.bankName = bankSelect.options[bankSelect.selectedIndex].text;
        payload.bankCode = bankSelect.value;
        payload.accountNumber = $("wd-acct-num").value.trim();
        payload.accountName = $("wd-acct-name").value.trim();
      } else {
        var wallet = $("wd-wallet").value.trim();
        if (!wallet || !wallet.startsWith("T") || wallet.length < 30) { showStatus("Enter a valid USDT TRC20 address", "err"); return; }
        payload.walletAddress = wallet;
        payload.usdAmount = liveUsdRate > 0 ? (amount / liveUsdRate).toFixed(4) : null;
        payload.rateUsed = liveUsdRate;
      }
      var res = await fetch(BACKEND + "/api/request-withdrawal", {
        method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (data.success) {
        userReferralEarnings -= amount;
        renderReferralTab();
        $("wd-amount").value = ""; $("wd-amount-equiv").textContent = "";
        showStatus("Withdrawal requested! Processing within 20 hours.", "ok");
      } else { throw new Error(data.error || "Failed"); }
    } catch(e) { showStatus("Error: " + e.message, "err"); }
    finally { btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "Request Withdrawal"; }
  };

  // ── REFERRAL URL TRACKING ──
  (function() {
    var ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("vg-ref", ref);
  })();

})();
