// DOM Elements
const postsContainer = document.getElementById('posts');
const loadMoreBtn = document.getElementById('loadMore');
const filters = document.querySelectorAll('#filters button');
const liveBanner = document.getElementById('live-banner');
const refreshBtn = document.getElementById('refreshBtn');
const feedView = document.getElementById('feed-view');
const postView = document.getElementById('post-view');
const postDetails = document.getElementById('post-details');
const postComments = document.getElementById('post-comments');
const backBtn = document.getElementById('backBtn');

// State variables
let currentType = 'newstories';
let currentPostIds = [];
let currentIndex = 0;
const postsPerPage = 10;
let liveCheckInterval = null;

// Initialize
loadPosts(currentType);
setActiveFilterButton(currentType);

// Filter button click event
filters.forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    if (type === currentType) return;
    currentType = type;
    setActiveFilterButton(type);
    resetFeed();
    loadPosts(type);
  });
});

// Back button to return to feed
backBtn.addEventListener('click', () => {
  postView.style.display = 'none';
  feedView.style.display = 'block';
  postDetails.innerHTML = '';
  postComments.innerHTML = '';
  window.location.hash = '';
});

// Refresh new posts (live)
refreshBtn.addEventListener('click', () => {
  resetFeed();
  loadPosts(currentType);
  liveBanner.classList.add('hidden');
});

// Load more button
loadMoreBtn.addEventListener('click', () => {
  displayPosts();
});

// UI helpers
function setActiveFilterButton(type) {
  filters.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
}

function resetFeed() {
  postsContainer.innerHTML = '';
  currentIndex = 0;
  currentPostIds = [];
  liveBanner.classList.add('hidden');
}

// Load post IDs
async function loadPosts(type) {
  if (type === 'polls') {
    const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=poll&hitsPerPage=100`);
    const data = await res.json();
    currentPostIds = data.hits.map(hit => parseInt(hit.objectID));
  } else {
    currentPostIds = await fetchIds(type === 'jobs' ? 'jobstories' : type);
  }

  currentPostIds.sort((a, b) => b - a);
  displayPosts();

  if (liveCheckInterval) clearInterval(liveCheckInterval);
  liveCheckInterval = setInterval(checkForLiveUpdates, 5000);
}

// Display posts
async function displayPosts() {
  const nextIds = currentPostIds.slice(currentIndex, currentIndex + postsPerPage);
  const items = await Promise.all(nextIds.map(id => fetchItem(id)));

  for (const item of items) {
    if (
      !item ||
      item.deleted ||
      item.dead ||
      (!item.title && !item.text && !item.url)
    ) continue; // Skip invalid/empty posts

    const postEl = createPostElement(item);
    postsContainer.appendChild(postEl);
  }

  currentIndex += postsPerPage;
  loadMoreBtn.style.display = currentIndex >= currentPostIds.length ? 'none' : 'block';
}

// Post element
function createPostElement(item) {
  const postElement = document.createElement('div');
  postElement.classList.add('post');

  const title = document.createElement('h3');
  title.innerHTML = item.title
    ? `<a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">${item.title}</a>`
    : '(no title)';
  postElement.appendChild(title);

  const meta = document.createElement('p');
  meta.textContent = `By ${item.by} - ${new Date(item.time * 1000).toLocaleString()}`;
  postElement.appendChild(meta);

  const commentsCount = item.kids ? item.kids.length : 0;
  const commentsBtn = document.createElement('button');
  commentsBtn.textContent = `View ${item.type === 'poll' ? 'Poll' : 'Comments'} (${commentsCount})`;
  commentsBtn.addEventListener('click', () => {
    showPostWithComments(item.id);
  });
  postElement.appendChild(commentsBtn);

  return postElement;
}

// Show full post + comments
async function showPostWithComments(postId) {
  feedView.style.display = 'none';
  postView.style.display = 'block';
  window.location.hash = `post-${postId}`;

  const post = await fetchItem(postId);
  if (!post) {
    postDetails.innerHTML = '<p>Post not found.</p>';
    postComments.innerHTML = '';
    return;
  }

  const postUrl = post.url || `https://news.ycombinator.com/item?id=${post.id}`;
  postDetails.innerHTML = `
    <h2><a href="${postUrl}" target="_blank" rel="noopener noreferrer">${post.title || '(no title)'}</a></h2>
    <p>By ${post.by} - ${new Date(post.time * 1000).toLocaleString()}</p>
    ${post.text ? `<div class="post-text">${post.text}</div>` : ''}
  `;

  // Poll options
  if (post.type === 'poll' && post.parts && post.parts.length) {
    const pollOptions = await Promise.all(post.parts.map(id => fetchItem(id)));
    const pollList = document.createElement('ul');
    pollList.classList.add('poll-options');

    pollOptions.forEach(opt => {
      if (!opt || (!opt.text && !opt.score)) return;
      const li = document.createElement('li');
      li.textContent = `${opt.text || 'Option'} — ${opt.score || 0} votes`;
      pollList.appendChild(li);
    });

    postDetails.appendChild(pollList);
  }

  // Comments
  postComments.innerHTML = '';
  if (post.kids && post.kids.length) {
    await loadComments(post.kids, postComments);
  } else {
    postComments.innerHTML = '<p>No comments.</p>';
  }
}

// Load nested comments
async function loadComments(ids, container, level = 0) {
  const comments = await Promise.all(ids.map(id => fetchItem(id)));
  comments
    .filter(c => c && !c.deleted && !c.dead)
    .sort((a, b) => b.time - a.time)
    .forEach(c => {
      const div = document.createElement('div');
      div.classList.add('comment');
      div.style.marginLeft = `${level * 15}px`;
      div.innerHTML = `<strong>${c.by}</strong>: ${c.text || ''}`;
      container.appendChild(div);
      if (c.kids) loadComments(c.kids, container, level + 1);
    });
}

// Fetch IDs list
async function fetchIds(type) {
  try {
    const res = await fetch(`https://hacker-news.firebaseio.com/v0/${type}.json`);
    return await res.json();
  } catch {
    return [];
  }
}

// Fetch single item
async function fetchItem(id) {
  try {
    const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    return await res.json();
  } catch {
    return null;
  }
}

// Fixed live update check
async function checkForLiveUpdates() {
  try {
    let newTopId;
    
    if (currentType === 'polls') {
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=poll&hitsPerPage=1`);
      const data = await res.json();
      if (data.hits.length > 0) {
        newTopId = parseInt(data.hits[0].objectID);
      }
    } else {
      const type = currentType === 'jobs' ? 'jobstories' : currentType;
      const ids = await fetchIds(type);
      if (ids.length > 0) {
        newTopId = ids[0];
      }
    }

    // Compare with current top post ID
    if (newTopId && currentPostIds.length > 0 && newTopId > currentPostIds[0]) {
      liveBanner.classList.remove('hidden');
    }
  } catch {
    // ignore errors
  }
}