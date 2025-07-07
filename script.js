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

let currentType = 'newstories';
let currentPostIds = [];
let currentIndex = 0;
const postsPerPage = 10;
let lastMaxItem = null;
let liveCheckInterval = null;

// Initialize feed
loadPosts(currentType);
setActiveFilterButton(currentType);

// Filter buttons event
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

// Back button from post view to feed
backBtn.addEventListener('click', () => {
  postView.style.display = 'none';
  feedView.style.display = 'block';
  postDetails.innerHTML = '';
  postComments.innerHTML = '';
  window.location.hash = '';
});

// Refresh live data banner
refreshBtn.addEventListener('click', () => {
  resetFeed();
  loadPosts(currentType);
  liveBanner.classList.add('hidden');
});

// Load more posts on button click
loadMoreBtn.addEventListener('click', () => {
  displayPosts();
});

// Set active filter button styling
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

// Load post IDs for given type
async function loadPosts(type) {
  if (type === 'polls') {
    // Polls are filtered from topstories (or newstories)
    const newIds = await fetchIds('topstories');
    const pollItems = await Promise.all(newIds.slice(0, 200).map(id => fetchItem(id)));
    currentPostIds = pollItems.filter(i => i && i.type === 'poll').map(i => i.id);
  } else if (type === 'jobs') {
    // Jobs use jobstories endpoint
    currentPostIds = await fetchIds('jobstories');
  } else {
    currentPostIds = await fetchIds(type);
  }
  currentPostIds.sort((a,b) => b - a);
  displayPosts();

  lastMaxItem = currentPostIds[0];

  if (liveCheckInterval) clearInterval(liveCheckInterval);

  liveCheckInterval = setInterval(checkForLiveUpdates, 5000);
}

// Display a batch of posts
async function displayPosts() {
  const nextIds = currentPostIds.slice(currentIndex, currentIndex + postsPerPage);
  const items = await Promise.all(nextIds.map(id => fetchItem(id)));

  for (const item of items) {
    if (!item) continue;
    const postEl = createPostElement(item);
    postsContainer.appendChild(postEl);
  }
  currentIndex += postsPerPage;
  if (currentIndex >= currentPostIds.length) {
    loadMoreBtn.style.display = 'none';
  } else {
    loadMoreBtn.style.display = 'block';
  }
}

// Create a post card element for main feed
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

  // Count comments from kids length or 0
  const commentsCount = item.kids ? item.kids.length : 0;

  const commentsBtn = document.createElement('button');
  commentsBtn.textContent = `View Comments (${commentsCount})`;
  commentsBtn.addEventListener('click', () => {
    showPostWithComments(item.id);
  });
  postElement.appendChild(commentsBtn);

  return postElement;
}

// Show single post + comments view
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

  postDetails.innerHTML = `
    <h2><a href="${post.url || '#'}" target="_blank" rel="noopener noreferrer">${post.title || '(no title)'}</a></h2>
    <p>By ${post.by} - ${new Date(post.time * 1000).toLocaleString()}</p>
    ${post.text ? `<p>${post.text}</p>` : ''}
  `;

  postComments.innerHTML = '';
  if (post.kids && post.kids.length) {
    await loadComments(post.kids, postComments);
  } else {
    postComments.innerHTML = '<p>No comments.</p>';
  }
}

// Recursively load nested comments newest → oldest
async function loadComments(ids, container, level = 0) {
  const comments = await Promise.all(ids.map(id => fetchItem(id)));
  comments
    .filter(c => c && !c.deleted && !c.dead)
    .sort((a,b) => b.time - a.time)
    .forEach(c => {
      const div = document.createElement('div');
      div.classList.add('comment');
      div.style.marginLeft = `${level * 15}px`;
      div.innerHTML = `<strong>${c.by}</strong>: ${c.text || ''}`;
      container.appendChild(div);
      if (c.kids) loadComments(c.kids, container, level + 1);
    });
}

// Fetch IDs list for type
async function fetchIds(type) {
  try {
    const res = await fetch(`https://hacker-news.firebaseio.com/v0/${type}.json`);
    return await res.json();
  } catch {
    return [];
  }
}

// Fetch a single item (post/comment)
async function fetchItem(id) {
  try {
    const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    return await res.json();
  } catch {
    return null;
  }
}

// Check live updates and show banner if new posts available
async function checkForLiveUpdates() {
  if (!lastMaxItem) return;
  try {
    const maxItem = await fetch(`https://hacker-news.firebaseio.com/v0/maxitem.json`).then(r => r.json());
    if (maxItem > lastMaxItem) {
      liveBanner.classList.remove('hidden');
    }
  } catch {
    // ignore errors
  }
}
