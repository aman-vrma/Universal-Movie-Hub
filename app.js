// ==========================================
// AD & POPUP SHIELD PROTECTION
// ==========================================
// Intercept and permanently block rogue popup windows
try {
    const _nativeOpen = window.open;
    window.open = function(url, target, features) {
        console.warn("🛡️ Ad-Shield: Blocked popup window ->", url);
        return null;
    };
} catch (e) {
    console.warn("Shield init warning:", e);
}

// ==========================================
// CONFIGURATION & GLOBAL STATE
// ==========================================
const SVG_FALLBACK_POSTER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='342' height='513' viewBox='0 0 342 513'%3E%3Crect width='342' height='513' fill='%23141414'/%3E%3Ccircle cx='171' cy='220' r='50' fill='%23222222'/%3E%3Cpath d='M155 195 L195 220 L155 245 Z' fill='%23e50914'/%3E%3Ctext x='171' y='300' fill='%23777777' font-family='sans-serif' font-size='16' text-anchor='middle'%3ENo Poster Available%3C/text%3E%3C/svg%3E";

const CONFIG = {
    API_KEY: 'f0da50d7b0c16984ccab202db5b1a2b1', // TMDB API Key
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_PATH: 'https://image.tmdb.org/t/p/w342',
    BACKDROP_PATH: 'https://image.tmdb.org/t/p/w780',
    NO_POSTER: SVG_FALLBACK_POSTER
};

let watchlist = JSON.parse(localStorage.getItem('movieHubWatchlist')) || [];
let activeItem = { id: null, type: 'movie', season: 1, episode: 1, currentServer: 1, trailerKey: null, isTrailer: false };
let activeItemData = null;
let userLang = localStorage.getItem('appLanguage') || 'en-US';
let currentActiveSection = 'home';

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const langPicker = document.getElementById('langSelect');
    if (langPicker) langPicker.value = userLang;

    setupNavigation();
    setupSearchListeners();
    initializeApp();
});

async function initializeApp() {
    showLoading();
    try {
        await Promise.all([
            fetchAndRender('/trending/all/week', 'trendingContent'),
            fetchAndRender('/movie/popular', 'popularMovies'),
            fetchAndRender('/tv/popular', 'topSeries'),
            fetchAndRender('/discover/tv?with_genres=16&with_origin_country=JP', 'animeCollection')
        ]);
    } catch (error) {
        console.error("Init Error:", error);
        showToast("Error loading content. Please check internet connection.", "error");
    } finally {
        hideLoading();
    }
}

// ==========================================
// DATA FETCHING (TMDB API)
// ==========================================
async function getMovies(params) {
    let url = "";

    if (params.id && params.type) {
        url = `${CONFIG.BASE_URL}/${params.type}/${params.id}?api_key=${CONFIG.API_KEY}&append_to_response=videos,credits&language=${userLang}`;
    } else if (params.query) {
        url = `${CONFIG.BASE_URL}/search/multi?api_key=${CONFIG.API_KEY}&query=${encodeURIComponent(params.query)}&language=${userLang}`;
    } else if (params.endpoint) {
        const joiner = params.endpoint.includes('?') ? '&' : '?';
        url = `${CONFIG.BASE_URL}${params.endpoint}${joiner}api_key=${CONFIG.API_KEY}&language=${userLang}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("TMDB Fetch Failed");
    return await response.json();
}

async function fetchAndRender(endpoint, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const data = await getMovies({ endpoint });
        if (data && data.results && data.results.length > 0) {
            container.innerHTML = data.results.map(item => generateMovieHTML(item)).join('');
        } else {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>No content available.</p></div>';
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load. Please refresh.</p></div>';
    }
}

function generateMovieHTML(item) {
    if (!item || !item.id) return '';
    const title = escapeHtml(item.title || item.name || "Untitled");
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    const posterUrl = item.poster_path ? (CONFIG.IMG_PATH + item.poster_path) : CONFIG.NO_POSTER;
    const vote = item.vote_average ? Number(item.vote_average).toFixed(1) : "NR";
    const releaseDate = item.release_date || item.first_air_date || '';
    const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';

    return `
        <div class="content-card" onclick="showMovieDetails(${item.id}, '${mediaType}')">
            <div class="poster-wrapper">
                <img src="${posterUrl}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='${CONFIG.NO_POSTER}'">
            </div>
            <div class="content-card-info">
                <h4 title="${title}">${title}</h4>
                <div class="card-meta">
                    <span class="rating-badge"><i class="fas fa-star"></i> ${vote}</span>
                    <span>${year}</span>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// DETAILS & STREAMING MODAL
// ==========================================
async function showMovieDetails(id, type) {
    if (!id) return;
    showLoading();

    const streamType = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
    activeItem = { 
        id: id, 
        type: streamType, 
        season: 1, 
        episode: 1, 
        currentServer: 1,
        trailerKey: null,
        isTrailer: false
    };

    try {
        const data = await getMovies({ id: activeItem.id, type: activeItem.type });
        activeItemData = data;

        // Extract YouTube Trailer if available
        if (data.videos && data.videos.results && data.videos.results.length > 0) {
            const trailer = data.videos.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || data.videos.results[0];
            if (trailer && trailer.key) {
                activeItem.trailerKey = trailer.key;
            }
        }

        const modal = document.getElementById('detailsModal');
        const displayArea = document.getElementById('detailsContent');
        const isSaved = watchlist.some(m => m.id === data.id);
        const title = escapeHtml(data.title || data.name || "Untitled");
        const releaseYear = (data.release_date || data.first_air_date || 'N/A').split('-')[0];
        const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : "NR";
        const genres = (data.genres && data.genres.length > 0) ? data.genres.map(g => g.name).join(' • ') : '';

        // Initial Stream URL
        const streamUrl = getStreamUrl(1, streamType, id, 1, 1);

        displayArea.innerHTML = `
            <div class="modal-body-content">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; gap:10px; flex-wrap:wrap;">
                    <h2 class="modal-title" style="margin-bottom:0;">${title}</h2>
                    <span class="ad-shield-badge"><i class="fas fa-shield-alt"></i> Ad-Shield Active</span>
                </div>

                <div class="modal-meta-row">
                    <span class="rating-badge"><i class="fas fa-star"></i> ${rating}</span>
                    <span>${releaseYear}</span>
                    <span class="modal-meta-tag">${streamType === 'tv' ? 'TV Series' : 'Movie'}</span>
                    ${genres ? `<span>${genres}</span>` : ''}
                </div>

                ${streamType === 'tv' ? `
                    <div class="episode-selector-bar">
                        <label for="seasonInput"><i class="fas fa-layer-group"></i> Season:</label>
                        <input type="number" id="seasonInput" min="1" max="50" value="1">
                        
                        <label for="episodeInput" style="margin-left:8px;"><i class="fas fa-play-circle"></i> Episode:</label>
                        <input type="number" id="episodeInput" min="1" max="100" value="1">
                        
                        <button class="play-ep-btn" onclick="updateEpisode()">Play Episode</button>
                    </div>
                ` : ''}

                <div class="video-player-wrap" id="playerWrap">
                    ${renderPlayerIframe(streamUrl)}
                </div>

                <p class="modal-overview">
                    ${escapeHtml(data.overview || 'No overview available for this title.')}
                </p>

                <div class="modal-actions">
                    <button class="server-btn btn-server-1 active" id="serverBtn1" onclick="switchServer(1)">Server 1 (Ad-Free HD)</button>
                    <button class="server-btn btn-server-2" id="serverBtn2" onclick="switchServer(2)">Server 2</button>
                    <button class="server-btn btn-server-3" id="serverBtn3" onclick="switchServer(3)">Server 3</button>

                    ${activeItem.trailerKey ? `
                        <button class="trailer-btn" id="trailerBtn" onclick="toggleTrailerView()">
                            <i class="fab fa-youtube"></i> Watch Trailer
                        </button>
                    ` : ''}

                    <button id="modalWatchlistBtn" class="watchlist-toggle-btn ${isSaved ? 'saved' : 'not-saved'}" onclick="toggleWatchlistCurrent()">
                        <i class="fas ${isSaved ? 'fa-check' : 'fa-plus'}"></i> ${isSaved ? 'Saved in Watchlist' : 'Add to Watchlist'}
                    </button>
                </div>
            </div>
        `;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (e) {
        console.error("Modal Error:", e);
        showToast("Failed to load details. Try again.", "error");
    } finally {
        hideLoading();
    }
}

function renderPlayerIframe(url) {
    return `
        <iframe 
            id="mainPlayerFrame" 
            src="${url}" 
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture" 
            allowfullscreen 
            referrerpolicy="origin"
            scrolling="no">
        </iframe>
    `;
}

// Server URL router
function getStreamUrl(serverNo, type, id, season = 1, episode = 1) {
    if (type === 'tv') {
        // Server 1: VidLink (Ad-Free, Built-in episodes, Subtitles)
        if (serverNo === 1) {
            return `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=e50914&secondaryColor=141414&iconColor=e50914`;
        }
        // Server 2: vidsrc.to / vidsrc.pro
        if (serverNo === 2) {
            return `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
        }
        // Server 3: vidsrc.me (sandboxed)
        return `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`;
    } else {
        // Server 1: VidLink (Ad-Free, HD, Subtitles)
        if (serverNo === 1) {
            return `https://vidlink.pro/movie/${id}?primaryColor=e50914&secondaryColor=141414&iconColor=e50914`;
        }
        // Server 2: vidsrc.to / vidsrc.pro
        if (serverNo === 2) {
            return `https://vidsrc.to/embed/movie/${id}`;
        }
        // Server 3: vidsrc.me (sandboxed)
        return `https://vidsrc.me/embed/movie?tmdb=${id}`;
    }
}

function switchServer(serverNo) {
    activeItem.currentServer = serverNo;
    activeItem.isTrailer = false;

    document.querySelectorAll('.server-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', (idx + 1) === serverNo);
    });

    const trailerBtn = document.getElementById('trailerBtn');
    if (trailerBtn) {
        trailerBtn.innerHTML = '<i class="fab fa-youtube"></i> Watch Trailer';
        trailerBtn.style.background = '#202020';
        trailerBtn.style.color = '#ff4444';
    }

    reloadPlayer();
    showToast(`Switched to Server ${serverNo}`);
}

function toggleTrailerView() {
    const wrap = document.getElementById('playerWrap');
    const trailerBtn = document.getElementById('trailerBtn');
    if (!wrap || !activeItem.trailerKey) return;

    if (!activeItem.isTrailer) {
        activeItem.isTrailer = true;
        wrap.innerHTML = `
            <iframe 
                src="https://www.youtube-nocookie.com/embed/${activeItem.trailerKey}?autoplay=1&rel=0" 
                allow="autoplay; encrypted-media; fullscreen" 
                allowfullscreen 
                scrolling="no">
            </iframe>
        `;
        if (trailerBtn) {
            trailerBtn.innerHTML = '<i class="fas fa-film"></i> Back to Movie';
            trailerBtn.style.background = 'var(--primary-red)';
            trailerBtn.style.color = '#fff';
        }
        document.querySelectorAll('.server-btn').forEach(btn => btn.classList.remove('active'));
        showToast("Playing Official Trailer");
    } else {
        switchServer(activeItem.currentServer || 1);
    }
}

function updateEpisode() {
    const sInput = document.getElementById('seasonInput');
    const eInput = document.getElementById('episodeInput');
    if (sInput && eInput) {
        activeItem.season = Math.max(1, parseInt(sInput.value) || 1);
        activeItem.episode = Math.max(1, parseInt(eInput.value) || 1);
        activeItem.isTrailer = false;
        reloadPlayer();
        showToast(`Playing Season ${activeItem.season}, Episode ${activeItem.episode}`);
    }
}

function reloadPlayer() {
    const wrap = document.getElementById('playerWrap');
    if (!wrap) return;

    const url = getStreamUrl(activeItem.currentServer, activeItem.type, activeItem.id, activeItem.season, activeItem.episode);
    wrap.innerHTML = renderPlayerIframe(url);
}

function closeModal() {
    const modal = document.getElementById('detailsModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = 'auto';

    // Destroy iframe immediately to terminate audio and streaming video
    const wrap = document.getElementById('playerWrap');
    if (wrap) wrap.innerHTML = '';
    activeItemData = null;
    activeItem.isTrailer = false;
}

function handleBackdropClick(event) {
    if (event.target.id === 'detailsModal') {
        closeModal();
    }
}

// ==========================================
// SEARCH & NAVIGATION
// ==========================================
function setupNavigation() {
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const targetSection = e.currentTarget.getAttribute('data-section');
            if (targetSection) navigateTo(targetSection);
        });
    });
}

function navigateTo(sectionId) {
    currentActiveSection = sectionId;

    // Update active class on both desktop and mobile navigation
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-section') === sectionId);
    });

    // Switch visible section
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');

    // If leaving search, clear search display
    if (sectionId !== 'home') {
        hideSearchResultsView();
    }

    // Lazy load section content
    if (sectionId === 'watchlist') renderWatchlist();
    if (sectionId === 'movies') fetchAndRender('/discover/movie', 'moviesGrid');
    if (sectionId === 'series') fetchAndRender('/discover/tv', 'seriesGrid');
    if (sectionId === 'anime') fetchAndRender('/discover/tv?with_genres=16&with_origin_country=JP', 'animeGrid');
    if (sectionId === 'home') {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput || !searchInput.value.trim()) {
            hideSearchResultsView();
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupSearchListeners() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeSearch(searchInput.value);
        });

        searchInput.addEventListener('input', (e) => {
            if (clearBtn) {
                clearBtn.style.display = e.target.value.trim() ? 'block' : 'none';
            }
        });
    }
}

function handleSearchClick() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim()) {
        executeSearch(searchInput.value);
    } else if (searchInput) {
        searchInput.focus();
    }
}

async function executeSearch(query) {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return;

    showLoading();
    try {
        const data = await getMovies({ query: cleanQuery });
        
        navigateTo('home');

        const searchResultsSection = document.getElementById('searchResultsSection');
        const searchResultsGrid = document.getElementById('searchResultsGrid');
        const searchResultsTitle = document.getElementById('searchResultsTitle');
        const homeDefaultRows = document.getElementById('homeDefaultRows');

        if (searchResultsSection && searchResultsGrid && homeDefaultRows) {
            searchResultsSection.style.display = 'block';
            homeDefaultRows.style.display = 'none';

            searchResultsTitle.innerHTML = `Search Results for: <span style="color:var(--primary-red); font-weight:700;">"${escapeHtml(cleanQuery)}"</span>`;

            if (data.results && data.results.length > 0) {
                searchResultsGrid.innerHTML = data.results.map(item => generateMovieHTML(item)).join('');
            } else {
                searchResultsGrid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <p>No results found for "${escapeHtml(cleanQuery)}".</p>
                    </div>
                `;
            }
        }

        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.style.display = 'block';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        console.error("Search Error:", e);
        showToast("Search failed. Check your connection.", "error");
    } finally {
        hideLoading();
    }
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';

    hideSearchResultsView();
}

function hideSearchResultsView() {
    const searchResultsSection = document.getElementById('searchResultsSection');
    const homeDefaultRows = document.getElementById('homeDefaultRows');
    if (searchResultsSection) searchResultsSection.style.display = 'none';
    if (homeDefaultRows) homeDefaultRows.style.display = 'block';
}

// ==========================================
// WATCHLIST MANAGEMENT
// ==========================================
function toggleWatchlistCurrent() {
    if (!activeItemData) return;

    const idx = watchlist.findIndex(i => i.id === activeItemData.id);
    const modalBtn = document.getElementById('modalWatchlistBtn');

    if (idx > -1) {
        watchlist.splice(idx, 1);
        showToast("Removed from Watchlist", "error");
        if (modalBtn) {
            modalBtn.className = "watchlist-toggle-btn not-saved";
            modalBtn.innerHTML = '<i class="fas fa-plus"></i> Add to Watchlist';
        }
    } else {
        const itemToSave = {
            id: activeItemData.id,
            title: activeItemData.title || activeItemData.name || 'Untitled',
            media_type: activeItem.type,
            poster_path: activeItemData.poster_path,
            vote_average: activeItemData.vote_average,
            release_date: activeItemData.release_date || activeItemData.first_air_date
        };
        watchlist.unshift(itemToSave);
        showToast("Added to Watchlist! 🍿", "success");
        if (modalBtn) {
            modalBtn.className = "watchlist-toggle-btn saved";
            modalBtn.innerHTML = '<i class="fas fa-check"></i> Saved in Watchlist';
        }
    }

    localStorage.setItem('movieHubWatchlist', JSON.stringify(watchlist));

    if (currentActiveSection === 'watchlist') {
        renderWatchlist();
    }
}

function renderWatchlist() {
    const grid = document.getElementById('watchlistGrid');
    const clearBtn = document.getElementById('clearWatchlistBtn');
    if (!grid) return;

    if (watchlist.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bookmark"></i>
                <p>Your Watchlist is empty.</p>
                <p style="font-size:0.85rem; color:#666; margin-top:6px;">Browse movies and series to save your favorites!</p>
            </div>
        `;
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    if (clearBtn) clearBtn.style.display = 'block';
    grid.innerHTML = watchlist.map(item => generateMovieHTML(item)).join('');
}

function clearAllWatchlist() {
    if (confirm("Are you sure you want to clear your entire watchlist?")) {
        watchlist = [];
        localStorage.setItem('movieHubWatchlist', JSON.stringify([]));
        renderWatchlist();
        showToast("Watchlist cleared.");
    }
}

// ==========================================
// LANGUAGE & HELPERS
// ==========================================
function setLanguage(lang) {
    userLang = lang;
    localStorage.setItem('appLanguage', lang);
    showToast(`Language switched to ${lang === 'hi-IN' ? 'Hindi' : 'English'}`);
    
    if (currentActiveSection === 'home') {
        initializeApp();
    } else {
        navigateTo(currentActiveSection);
    }
}

function showLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.add('active');
}

function hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.remove('active');
}

function showToast(message, type = "success") {
    const existing = document.querySelector('.custom-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerText = message;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%) translateY(20px)',
        backgroundColor: type === 'error' ? '#e50914' : '#28a745',
        color: '#fff',
        padding: '10px 22px',
        borderRadius: '30px',
        fontWeight: '600',
        fontSize: '0.88rem',
        zIndex: '10000',
        boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
        transition: 'all 0.25s ease',
        opacity: '0'
    });
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 2400);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
