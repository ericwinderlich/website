// ==========================================================================
// JavaScript Application Logic - App Portal
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  const appsGrid = document.getElementById('apps-grid');
  const filterNav = document.getElementById('filter-nav');
  const shareBtn = document.getElementById('share-btn');
  const toast = document.getElementById('toast');
  
  let appsData = [];

  // Fetch apps data from local JSON
  async function fetchApps() {
    try {
      const response = await fetch('apps.json');
      if (!response.ok) {
        throw new Error('Daten konnten nicht geladen werden.');
      }
      appsData = await response.json();
      renderApps(appsData);
    } catch (error) {
      console.error('Error fetching apps:', error);
      appsGrid.innerHTML = `
        <div class="loading-state">
          <p style="color: #ef4444;">Fehler beim Laden der Apps. Bitte versuche es später noch einmal.</p>
        </div>
      `;
    }
  }

  // Helper to resolve flag emojis to custom SVGs on Windows
  function getIconHTML(icon) {
    if (!icon) return '📱';
    
    if (icon === '🇪🇸') {
      return `
        <svg class="flag-svg es" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 500">
          <rect width="750" height="500" fill="#c60b1e"/>
          <rect y="125" width="750" height="250" fill="#f1bf00"/>
          <!-- Simplified Coat of Arms -->
          <g transform="translate(180, 250) scale(1.1)">
            <!-- Crown -->
            <path d="M-15,-45 L-9,-33 L0,-48 L9,-33 L15,-45 L11,-27 L-11,-27 Z" fill="#c60b1e"/>
            <path d="M-15,-45 L-9,-33 L0,-48 L9,-33 L15,-45 L11,-27 L-11,-27 Z" fill="none" stroke="#f1bf00" stroke-width="2.5"/>
            <!-- Shield -->
            <path d="M-13,-24 L13,-24 L13,6 C13,17 -13,17 -13,6 Z" fill="#c60b1e" stroke="#ffffff" stroke-width="2"/>
            <path d="M-13,-24 L13,-24 L13,6 C13,17 -13,17 -13,6 Z" fill="none" stroke="#f1bf00" stroke-width="3"/>
            <path d="M-13,-24 L0,-24 L0,13 C-7,13 -13,10 -13,6 Z" fill="#f1bf00"/>
            <!-- Pillars -->
            <rect x="-24" y="-22" width="5" height="38" rx="1" fill="#ffffff" stroke="#999999" stroke-width="1.2"/>
            <rect x="19" y="-22" width="5" height="38" rx="1" fill="#ffffff" stroke="#999999" stroke-width="1.2"/>
          </g>
        </svg>
      `;
    }
    
    if (icon === '🇬🇧') {
      return `
        <svg class="flag-svg gb" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30">
          <rect width="60" height="30" fill="#012169"/>
          <path d="M-10,-5 L70,35 M70,-5 L-10,35" stroke="#ffffff" stroke-width="6"/>
          <path d="M-10,-5 L70,35 M70,-5 L-10,35" stroke="#C8102E" stroke-width="2"/>
          <path d="M30,-5 L30,35 M-10,15 L70,15" stroke="#ffffff" stroke-width="10"/>
          <path d="M30,-5 L30,35 M-10,15 L70,15" stroke="#C8102E" stroke-width="6"/>
        </svg>
      `;
    }
    
    return icon;
  }

  // Render cards to grid
  function renderApps(appsToRender) {
    appsGrid.innerHTML = '';
    
    if (appsToRender.length === 0) {
      appsGrid.innerHTML = `
        <div class="loading-state">
          <p>Keine Apps in dieser Kategorie gefunden.</p>
        </div>
      `;
      return;
    }

    appsToRender.forEach(app => {
      const card = document.createElement('article');
      
      // Determine bento grid class
      let gridClass = 'card-normal';
      if (app.gridSize === 'large') gridClass = 'card-large';
      else if (app.gridSize === 'wide') gridClass = 'card-wide';
      
      let progressClass = '';
      if (app.status && app.status.toLowerCase() === 'in arbeit') {
        progressClass = 'card-in-arbeit';
      }
      
      card.className = `app-card ${gridClass} ${progressClass}`;
      
      // Build badge markup
      let badgesHTML = '';
      if (app.status) {
        let statusClass = '';
        if (app.status.toLowerCase() === 'produktiv') statusClass = 'produktiv';
        else if (app.status.toLowerCase() === 'spotify') statusClass = 'spotify-badge';
        else if (app.status.toLowerCase() === 'in arbeit') statusClass = 'in-arbeit';
        else statusClass = 'active';
        
        badgesHTML += `<span class="badge badge-status ${statusClass}">${app.status}</span>`;
      }
      
      if (app.isOpenSource) {
        badgesHTML += `<span class="badge badge-os">Open Source</span>`;
      }

      // Build action buttons markup
      let buttonsHTML = '';
      if (app.links) {
        if (app.links.guide) {
          buttonsHTML += `
            <a href="#" class="link-btn link-btn-web link-btn-guide">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Anleitung lesen
            </a>
          `;
        }
        if (app.links.web) {
          buttonsHTML += `
            <a href="${app.links.web}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-web">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              Öffnen
            </a>
          `;
        }
        if (app.links.spotify) {
          buttonsHTML += `
            <a href="${app.links.spotify}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-spotify">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.98-.336.075-.668-.135-.745-.47-.077-.337.136-.669.471-.747 3.847-.877 7.147-.5 9.82 1.14.294.178.384.564.207.86zm1.226-2.723c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.845-.107-.97-.52-.125-.413.108-.844.52-.97 3.67-1.114 8.243-.574 11.345 1.334.366.226.486.708.26 1.074zm.107-2.847C14.6 8.57 9.124 8.39 5.96 9.35c-.477.145-.98-.125-1.126-.6-.147-.478.125-.98.602-1.127 3.655-1.11 9.69-.9 13.518 1.37.43.255.57.81.314 1.24-.254.43-.81.57-1.242.315z"/>
              </svg>
              Spotify
            </a>
          `;
        }
        if (app.links.apple) {
          buttonsHTML += `
            <a href="${app.links.apple}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-apple">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              Apple Music
            </a>
          `;
        }
        if (app.links.youtube) {
          buttonsHTML += `
            <a href="${app.links.youtube}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-youtube">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.516 3.514 12 3.514 12 3.514s-7.516 0-9.388.541a3.003 3.003 0 0 0-2.11 2.108C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.108c1.872.541 9.388.541 9.388.541s7.516 0 9.388-.541a3.003 3.003 0 0 0 2.11-2.108C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTube
            </a>
          `;
        }
      }

      if (app.github) {
        buttonsHTML += `
          <a href="${app.github}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-github">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            GitHub
          </a>
        `;
      }

      // Check for YouTube Embed (Pocket Player format)
      let embedHTML = '';
      if (app.youtubePlaylistId) {
        const playlistValue = Array.isArray(app.youtubePlaylistId) 
          ? JSON.stringify(app.youtubePlaylistId) 
          : app.youtubePlaylistId;

        embedHTML = `
          <div class="pocket-player" id="pocket-player" data-playlist='${playlistValue}'>
            <div class="player-info-row">
              <div class="player-controls">
                <button class="player-btn" id="player-prev-btn" aria-label="Vorheriger Titel">
                  <svg viewBox="0 0 24 24" fill="currentColor" class="icon" style="width: 12px; height: 12px;"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/></svg>
                </button>
                <button class="player-btn player-btn-main" id="player-play-btn" aria-label="Wiedergabe">
                  <svg id="play-svg" viewBox="0 0 24 24" fill="currentColor" class="icon" style="width: 14px; height: 14px; margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <svg id="pause-svg" viewBox="0 0 24 24" fill="currentColor" class="icon" style="width: 14px; height: 14px; display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <button class="player-btn" id="player-next-btn" aria-label="Nächster Titel">
                  <svg viewBox="0 0 24 24" fill="currentColor" class="icon" style="width: 12px; height: 12px;"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>
                </button>
              </div>

              <div class="player-info" style="justify-content: flex-end;">
                <div class="player-album-art">
                  <svg class="icon player-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                </div>
                <div class="player-details" style="text-align: right;">
                  <div class="player-title" id="player-track-title">Wird geladen...</div>
                  <div class="player-artist">GenEric</div>
                </div>
              </div>
            </div>

            <div class="player-progress-container">
              <span class="player-time" id="player-current-time">0:00</span>
              <div class="player-progress-bar" id="player-progress-bar">
                <div class="player-progress-fill" id="player-progress-fill"></div>
              </div>
              <span class="player-time" id="player-duration">0:00</span>
            </div>
          </div>
        `;
      }

      let updatedHTML = '';
      if (app.lastUpdated) {
        updatedHTML = `
          <div class="app-updated-date" id="updated-${app.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; vertical-align: middle; opacity: 0.7; display: inline-block;">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="date-text" style="vertical-align: middle; margin-left: 4px;">Aktualisiert: ${app.lastUpdated}</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div>
          <div class="card-header">
            <div class="app-icon-container">
              ${getIconHTML(app.icon)}
            </div>
            <div class="badge-group">
              ${badgesHTML}
            </div>
          </div>
          <div class="card-body">
            <h2 class="app-title">${app.title}</h2>
            <p class="app-description">${app.description}</p>
            ${embedHTML}
            ${updatedHTML}
          </div>
        </div>
        <div class="card-footer">
          ${buttonsHTML}
        </div>
      `;
      
      appsGrid.appendChild(card);
    });

    // Update lastUpdated dates dynamically from GitHub API
    appsToRender.forEach(app => {
      if (!app.github) return;
      const repoInfo = extractGithubRepo(app.github);
      if (!repoInfo) return;

      fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`)
        .then(res => {
          if (!res.ok) throw new Error('GitHub API Limit oder Fehler');
          return res.json();
        })
        .then(data => {
          if (data.pushed_at) {
            const pushedDate = new Date(data.pushed_at);
            const formattedDate = pushedDate.toLocaleDateString('de-DE', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            });
            const dateEl = document.querySelector(`#updated-${app.id} .date-text`);
            if (dateEl) {
              dateEl.textContent = `Aktualisiert: ${formattedDate}`;
            }
          }
        })
        .catch(err => {
          // Graceful fallback to static JSON date already rendered
          console.log(`GitHub API nicht erreichbar für ${app.id}, nutze Fallback-Datum.`);
        });
    });

    // Initialize pocket player if present in rendered cards
    const pocketPlayerEl = document.getElementById('pocket-player');
    if (pocketPlayerEl) {
      const playlistId = pocketPlayerEl.dataset.playlist;
      initPocketPlayer(playlistId);
    }
  }

  // Helper to extract GitHub owner and repo from URL
  function extractGithubRepo(url) {
    if (!url) return null;
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, '')
      };
    }
    return null;
  }

  // Category Filtering Setup
  filterNav.addEventListener('click', (e) => {
    if (!e.target.classList.contains('filter-btn')) return;

    // Toggle active state
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');

    const selectedCategory = e.target.dataset.category;
    
    // Filter apps list
    if (selectedCategory === 'all') {
      renderApps(appsData);
    } else {
      const filteredApps = appsData.filter(app => app.category === selectedCategory);
      renderApps(filteredApps);
    }
  });

  // Share Button Clipboard Action
  shareBtn.addEventListener('click', () => {
    const shareUrl = window.location.href;
    
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        showToast('Link kopiert!');
      })
      .catch(err => {
        console.error('Could not copy link: ', err);
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showToast('Link kopiert!');
        } catch (e) {
          alert('Link konnte nicht kopiert werden. Bitte kopiere die URL aus der Adresszeile.');
        }
        document.body.removeChild(textarea);
      });
  });

  // Copy Prompt logic
  const promptCopyBtn = document.getElementById('prompt-copy-btn');
  if (promptCopyBtn) {
    promptCopyBtn.addEventListener('click', () => {
      const promptText = document.querySelector('.prompt-text').innerText;
      navigator.clipboard.writeText(promptText)
        .then(() => {
          showToast('Prompt kopiert!');
        })
        .catch(err => {
          console.error('Could not copy prompt: ', err);
          const textarea = document.createElement('textarea');
          textarea.value = promptText;
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
            showToast('Prompt kopiert!');
          } catch (e) {
            alert('Prompt konnte nicht kopiert werden.');
          }
          document.body.removeChild(textarea);
        });
    });
  }

  function showToast(message = 'Link kopiert!') {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // ==========================================================================
  // CUSTOM YOUTUBE AUDIO-ONLY PLAYER CONTROLLER
  // ==========================================================================
  let ytPlayer = null;
  let progressInterval = null;
  let playlistTracks = [];
  let currentTrackIndex = 0;

  function initPocketPlayer(playlistId) {
    // Clean up existing hidden player iframe/element if switching categories
    const existingHidden = document.getElementById('hidden-yt-player');
    if (existingHidden) {
      existingHidden.remove();
    }
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    ytPlayer = null;

    let tracks = [];
    let isPlaylistId = true;

    try {
      // If it's a JSON array of video IDs
      if (playlistId.startsWith('[')) {
        tracks = JSON.parse(playlistId);
        isPlaylistId = false;
      }
    } catch(e) {
      isPlaylistId = true;
    }

    // Check if global YT is already loaded
    if (window.YT && window.YT.Player) {
      createYTPlayer(playlistId, isPlaylistId, tracks);
    } else {
      // Define global callback for YT API
      window.onYouTubeIframeAPIReady = function() {
        createYTPlayer(playlistId, isPlaylistId, tracks);
      };
      
      // Load YouTube Player API script if not already loaded
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }

  function createYTPlayer(playlistId, isPlaylistId, tracks) {
    const playerDiv = document.createElement('div');
    playerDiv.id = 'hidden-yt-player';
    playerDiv.style.position = 'absolute';
    playerDiv.style.width = '0';
    playerDiv.style.height = '0';
    playerDiv.style.opacity = '0';
    playerDiv.style.pointerEvents = 'none';
    document.body.appendChild(playerDiv);

    const playerVars = {
      loop: 1,
      shuffle: 0
    };

    if (isPlaylistId) {
      playerVars.listType = 'playlist';
      playerVars.list = playlistId;
    } else {
      playerVars.playlist = tracks.join(',');
    }

    ytPlayer = new YT.Player('hidden-yt-player', {
      height: '0',
      width: '0',
      playerVars: playerVars,
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  }

  function onPlayerReady(event) {
    const playBtn = document.getElementById('player-play-btn');
    const prevBtn = document.getElementById('player-prev-btn');
    const nextBtn = document.getElementById('player-next-btn');
    const progressBar = document.getElementById('player-progress-bar');
    const titleEl = document.getElementById('player-track-title');
    const albumArtEl = document.querySelector('.player-album-art');

    // Populate our custom playlist tracks array
    const playlist = ytPlayer.getPlaylist();
    playlistTracks = playlist || [];
    currentTrackIndex = 0;

    if (titleEl) {
      if (playlistTracks.length > 0) {
        titleEl.innerText = "Bereit zum Abspielen";
        
        // Dynamically load the first video's cover thumbnail
        const firstVideoId = playlistTracks[0];
        if (firstVideoId && albumArtEl) {
          const thumbnailUrl = `https://img.youtube.com/vi/${firstVideoId}/mqdefault.jpg`;
          albumArtEl.innerHTML = `<img src="${thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="Cover">`;
        }
      } else {
        titleEl.innerText = "Meine Musik";
      }
    }

    if (playBtn) {
      playBtn.onclick = () => {
        if (!ytPlayer) return;
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
          ytPlayer.pauseVideo();
        } else {
          ytPlayer.playVideo();
        }
      };
    }

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (ytPlayer && playlistTracks.length > 0) {
          currentTrackIndex = (currentTrackIndex - 1 + playlistTracks.length) % playlistTracks.length;
          ytPlayer.loadVideoById(playlistTracks[currentTrackIndex]);
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (ytPlayer && playlistTracks.length > 0) {
          currentTrackIndex = (currentTrackIndex + 1) % playlistTracks.length;
          ytPlayer.loadVideoById(playlistTracks[currentTrackIndex]);
        }
      };
    }

    if (progressBar) {
      progressBar.onclick = (e) => {
        if (!ytPlayer || !ytPlayer.getDuration) return;
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const clickPercent = clickX / width;
        const newTime = clickPercent * ytPlayer.getDuration();
        ytPlayer.seekTo(newTime, true);
        updateProgress();
      };
    }
  }

  function onPlayerStateChange(event) {
    const playSvg = document.getElementById('play-svg');
    const pauseSvg = document.getElementById('pause-svg');
    const playerContainer = document.getElementById('pocket-player');
    const titleEl = document.getElementById('player-track-title');
    const currentTimeText = document.getElementById('player-current-time');
    const durationText = document.getElementById('player-duration');
    const progressFill = document.getElementById('player-progress-fill');
    const albumArtEl = document.querySelector('.player-album-art');

    if (event.data === YT.PlayerState.PLAYING) {
      if (playSvg) playSvg.style.display = 'none';
      if (pauseSvg) pauseSvg.style.display = 'block';
      if (playerContainer) playerContainer.classList.add('playing');
      
      const videoData = ytPlayer.getVideoData();
      if (videoData && videoData.title && titleEl) {
        titleEl.innerText = videoData.title;
      }
      
      // Update dynamic cover art thumbnail for the active playing video
      if (videoData && videoData.video_id) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoData.video_id}/mqdefault.jpg`;
        if (albumArtEl) {
          albumArtEl.innerHTML = `<img src="${thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="Cover">`;
        }
        
        // Sync our local currentTrackIndex with the playing video
        const index = playlistTracks.indexOf(videoData.video_id);
        if (index !== -1) {
          currentTrackIndex = index;
        }
      }

      if (progressInterval) clearInterval(progressInterval);
      progressInterval = setInterval(() => {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const current = ytPlayer.getCurrentTime();
        const duration = ytPlayer.getDuration();
        if (duration > 0) {
          const percent = (current / duration) * 100;
          if (progressFill) progressFill.style.width = `${percent}%`;
          if (currentTimeText) currentTimeText.innerText = formatTime(current);
          if (durationText) durationText.innerText = formatTime(duration);
        }
      }, 500);
    } else if (event.data === YT.PlayerState.ENDED) {
      // Auto-play next song on end
      if (playlistTracks.length > 0) {
        currentTrackIndex = (currentTrackIndex + 1) % playlistTracks.length;
        ytPlayer.loadVideoById(playlistTracks[currentTrackIndex]);
      }
    } else {
      if (playSvg) playSvg.style.display = 'block';
      if (pauseSvg) pauseSvg.style.display = 'none';
      if (playerContainer) playerContainer.classList.remove('playing');
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }
  }


  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // Listen for clicks on the guide button (Event Delegation)
  appsGrid.addEventListener('click', (e) => {
    const guideBtn = e.target.closest('.link-btn-guide');
    if (guideBtn) {
      e.preventDefault();
      const modal = document.getElementById('guide-modal');
      if (modal) {
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
    }
  });

  // Close modal logic
  const modal = document.getElementById('guide-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const backdrop = modal ? modal.querySelector('.modal-backdrop') : null;

  function closeModal() {
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
      closeModal();
    }
  });

  // Mail Popover Logic
  const mailBtn = document.getElementById('mail-btn');
  const mailPopover = document.getElementById('mail-popover');
  const popoverMailCopy = document.getElementById('popover-mail-copy');
  const popoverMailOpen = document.getElementById('popover-mail-open');

  if (mailBtn && mailPopover) {
    mailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShown = mailPopover.classList.contains('show');
      if (isShown) {
        closeMailPopover();
      } else {
        mailPopover.classList.add('show');
        mailPopover.setAttribute('aria-hidden', 'false');
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!mailPopover.contains(e.target) && e.target !== mailBtn) {
        closeMailPopover();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMailPopover();
      }
    });
    
    function closeMailPopover() {
      mailPopover.classList.remove('show');
      mailPopover.setAttribute('aria-hidden', 'true');
    }

    if (popoverMailCopy) {
      popoverMailCopy.addEventListener('click', () => {
        const email = 'mail@ericwinderlich.de';
        navigator.clipboard.writeText(email)
          .then(() => {
            showToast('E-Mail kopiert!');
            closeMailPopover();
          })
          .catch(err => {
            console.error('Could not copy email: ', err);
            const textarea = document.createElement('textarea');
            textarea.value = email;
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand('copy');
              showToast('E-Mail kopiert!');
            } catch (e) {
              alert('E-Mail konnte nicht kopiert werden.');
            }
            document.body.removeChild(textarea);
            closeMailPopover();
          });
      });
    }

    if (popoverMailOpen) {
      popoverMailOpen.addEventListener('click', () => {
        closeMailPopover();
      });
    }
  }

  // Initial Data Load
  fetchApps();
});
