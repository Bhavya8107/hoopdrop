/* ===================================================================
   HoopDrop — Main Application Controller & Physics
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const countValueEl = document.getElementById('count-value');
  const counterBadgeEl = document.getElementById('upload-counter');
  const dropZoneEl = document.getElementById('drop-zone');
  const hoopEl = document.getElementById('hoop-assembly');
  const shootingCourtEl = document.getElementById('shooting-court');
  const uploadShelfEl = document.getElementById('upload-shelf');
  const fileInputEl = document.getElementById('file-input');
  const newBallBtn = document.getElementById('new-ball-btn');
  const resetBtn = document.getElementById('reset-counter-btn');
  const soundBtn = document.getElementById('sound-btn');
  const particleCanvas = document.getElementById('particle-canvas');
  const ctx = particleCanvas ? particleCanvas.getContext('2d') : null;

  // --- State Variables ---
  let uploadCount = 0;
  let particles = [];
  let isDragging = false;
  let activeCard = null;
  let dragOffset = { x: 0, y: 0 };
  let lastPos = { x: 0, y: 0, time: 0 };
  let velocity = { x: 0, y: 0 };
  let animationFrameId = null;

  // Resize particle canvas
  function resizeCanvas() {
    if (!particleCanvas) return;
    const stage = document.getElementById('stage');
    particleCanvas.width = stage.clientWidth;
    particleCanvas.height = stage.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // --- Particle System ---
  class Particle {
    constructor(x, y, vx, vy, color, size, decay) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color || '#ff6b4a';
      this.size = size || 3;
      this.alpha = 1;
      this.decay = decay || 0.035;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.08; // subtle gravity
      this.alpha -= this.decay;
      return this.alpha > 0;
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function emitParticles(x, y, count = 3, spread = 2, color = '#ff7854', size = 3) {
    if (!ctx) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * spread;
      particles.push(new Particle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 0.5,
        color,
        size * (0.8 + Math.random() * 0.5),
        0.02 + Math.random() * 0.03
      ));
    }
  }

  function particleLoop() {
    if (ctx && particleCanvas) {
      ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      particles = particles.filter(p => {
        const alive = p.update();
        if (alive) p.draw(ctx);
        return alive;
      });
    }
    requestAnimationFrame(particleLoop);
  }
  particleLoop();

  // --- Trajectory & Slingshot Elements ---
  const trajectoryLine = document.getElementById('trajectory-line');
  const trajectoryDotsGroup = document.getElementById('trajectory-dots');
  const slingshotHint = document.getElementById('slingshot-hint');

  function updateTrajectory(card) {
    if (!card || !trajectoryLine) return null;

    const stage = document.getElementById('stage');
    const stageRect = stage.getBoundingClientRect();
    const hoopRect = hoopEl.getBoundingClientRect();

    // Target inside rim center
    const targetX = hoopRect.left + hoopRect.width / 2 - stageRect.left;
    const targetY = hoopRect.top + 38 - stageRect.top;

    // Card center relative to stage
    const cardRect = card.getBoundingClientRect();
    const cardX = cardRect.left + cardRect.width / 2 - stageRect.left;
    const cardY = cardRect.top + cardRect.height / 2 - stageRect.top;

    // Slingshot pull calculation:
    // As user pulls down, the trajectory peaks higher and arches into the hoop
    const pullDown = Math.max(0, currentTranslateY);
    const midX = (cardX + targetX) / 2 + (targetX - cardX) * 0.05;
    const midY = Math.min(cardY, targetY) - 95 - pullDown * 0.75;

    // Dotted quadratic curve path
    const pathD = `M ${cardX} ${cardY} Q ${midX} ${midY} ${targetX} ${targetY}`;
    trajectoryLine.setAttribute('d', pathD);
    trajectoryLine.classList.add('visible');

    // Trajectory dots along curve
    if (trajectoryDotsGroup) {
      const numDots = 9;
      let dotsHtml = '';
      for (let i = 1; i <= numDots; i++) {
        const t = i / (numDots + 1);
        const invT = 1 - t;
        const dx = invT * invT * cardX + 2 * invT * t * midX + t * t * targetX;
        const dy = invT * invT * cardY + 2 * invT * t * midY + t * t * targetY;
        const r = 3.6 - t * 1.2;
        dotsHtml += `<circle class="trajectory-dot" cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${r.toFixed(1)}" />`;
      }
      trajectoryDotsGroup.innerHTML = dotsHtml;
    }

    return { cardX, cardY, midX, midY, targetX, targetY };
  }

  function hideTrajectory() {
    if (trajectoryLine) {
      trajectoryLine.classList.remove('visible');
    }
    if (trajectoryDotsGroup) {
      trajectoryDotsGroup.innerHTML = '';
    }
  }

  // --- Drag and Throw Handling ---
  let startX = 0;
  let startY = 0;
  let currentTranslateX = 0;
  let currentTranslateY = 0;
  let posHistory = [];

  function initDraggableCard(card) {
    if (!card) return;

    function onPointerDown(e) {
      if (card.dataset.shooting === 'true') return;
      isDragging = true;
      activeCard = card;

      window.sounds.init();

      // Hide hint once user starts interacting
      if (slingshotHint) {
        slingshotHint.style.opacity = '0';
      }

      startX = e.clientX;
      startY = e.clientY;
      currentTranslateX = 0;
      currentTranslateY = 0;

      const now = performance.now();
      lastPos = { x: e.clientX, y: e.clientY, time: now };
      velocity = { x: 0, y: 0 };
      posHistory = [{ x: e.clientX, y: e.clientY, time: now }];

      card.classList.add('dragging');
      dropZoneEl.classList.add('drag-active');
      document.body.style.cursor = 'grabbing';

      if (card.setPointerCapture && e.pointerId !== undefined) {
        try { card.setPointerCapture(e.pointerId); } catch (_) {}
      }

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);

      // Show initial trajectory
      updateTrajectory(card);
    }

    card.addEventListener('pointerdown', onPointerDown);
  }

  function onPointerMove(e) {
    if (!isDragging || !activeCard) return;

    const now = performance.now();
    const dt = Math.max(1, now - lastPos.time);

    // Calculate instantaneous velocity (pixels per ms)
    velocity.x = (e.clientX - lastPos.x) / dt;
    velocity.y = (e.clientY - lastPos.y) / dt;
    lastPos = { x: e.clientX, y: e.clientY, time: now };

    // Record movement history for flick release
    posHistory.push({ x: e.clientX, y: e.clientY, time: now });
    while (posHistory.length > 1 && now - posHistory[0].time > 150) {
      posHistory.shift();
    }

    currentTranslateX = e.clientX - startX;
    currentTranslateY = e.clientY - startY;

    // Slingshot pull down vs flick up behavior
    if (currentTranslateY > 0) {
      // Pulling DOWN (Slingshot tension mode!)
      const pullDown = Math.min(180, currentTranslateY);
      const stretchX = 1 - (pullDown / 600);
      const stretchY = 1 + (pullDown / 450);
      const tilt = Math.max(-20, Math.min(20, currentTranslateX * 0.2));
      activeCard.style.transform = `translate(${currentTranslateX}px, ${pullDown}px) scale(${stretchX}, ${stretchY}) rotate(${tilt}deg)`;
    } else {
      // Dragging UP / sideways
      const tilt = Math.max(-25, Math.min(25, velocity.x * 25));
      activeCard.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) rotate(${tilt}deg) scale(1.05)`;
    }

    // Always update and show dotted trajectory towards the hoop!
    updateTrajectory(activeCard);

    // Emit orange trail particles
    const stageRect = document.getElementById('stage').getBoundingClientRect();
    const canvasX = e.clientX - stageRect.left;
    const canvasY = e.clientY - stageRect.top;

    if (Math.random() < 0.5) {
      emitParticles(canvasX, canvasY, 1, 1.2, '#ff7854', 2.6);
    }

    dropZoneEl.classList.add('drag-active');
  }

  function onPointerUp(e) {
    if (!isDragging || !activeCard) return;
    isDragging = false;
    document.body.style.cursor = '';
    dropZoneEl.classList.remove('drag-active');

    if (activeCard.releasePointerCapture && e.pointerId !== undefined) {
      try { activeCard.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    const clientX = e.clientX || lastPos.x;
    const clientY = e.clientY || lastPos.y;

    // Calculate release flick velocity over last 150ms
    const oldest = posHistory[0] || { x: clientX, y: clientY, time: performance.now() - 10 };
    const historyDt = Math.max(10, performance.now() - oldest.time);
    const flickVy = (clientY - oldest.y) / historyDt;

    // 1. PULL DOWN AND RELEASE (Slingshot throw!)
    const isSlingshotPull = currentTranslateY > 20;

    // 2. UPWARD FLICK OR DRAG UP
    const isUpwardFlick = flickVy < -0.08 || velocity.y < -0.08;
    const isDraggedUp = currentTranslateY < -30;
    const isHighEnough = clientY < window.innerHeight * 0.75 && currentTranslateY < -10;

    const shouldShoot = isSlingshotPull || isUpwardFlick || isDraggedUp || isHighEnough;

    const trajectoryData = updateTrajectory(activeCard);
    hideTrajectory();

    if (shouldShoot) {
      // Execute shot into the hoop along the dotted trajectory!
      shootIntoHoop(activeCard, trajectoryData);
    } else {
      // Snap card smoothly back to rest position
      activeCard.classList.remove('dragging');
      activeCard.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      activeCard.style.transform = 'translate(0px, 0px) rotate(0deg)';
      setTimeout(() => {
        if (activeCard) activeCard.style.transition = '';
      }, 350);
    }

    activeCard = null;
  }

  // --- Ball Flight Animation & Hoop Swish ---
  function shootIntoHoop(card, trajectoryData) {
    card.dataset.shooting = 'true';
    window.sounds.playThrow();

    const stageRect = document.getElementById('stage').getBoundingClientRect();
    const hoopRect = hoopEl.getBoundingClientRect();
    const targetX = hoopRect.left + hoopRect.width / 2;
    const targetY = hoopRect.top + 38;

    const cardRect = card.getBoundingClientRect();
    const currentX = cardRect.left + cardRect.width / 2;
    const currentY = cardRect.top + cardRect.height / 2;

    const midX = trajectoryData ? (trajectoryData.midX + stageRect.left) : (currentX + targetX) / 2;
    const midY = trajectoryData ? (trajectoryData.midY + stageRect.top) : Math.min(currentY, targetY) - 90;

    // Create a clone for the smooth ballistic flight
    const flyer = card.cloneNode(true);
    flyer.classList.remove('dragging');
    flyer.classList.add('flying-file');
    flyer.style.position = 'fixed';
    flyer.style.left = `${currentX - 36}px`;
    flyer.style.top = `${currentY - 45}px`;
    flyer.style.width = '72px';
    flyer.style.height = '90px';
    flyer.style.margin = '0';
    flyer.style.transform = 'translate(0px, 0px) scale(1.05)';
    flyer.style.zIndex = '7'; // Between back rim (6) and front rim (12)!
    document.body.appendChild(flyer);

    // Hide original card
    card.style.opacity = '0';
    card.style.pointerEvents = 'none';

    // Animation trajectory along the exact dotted curve
    const startTime = performance.now();
    const duration = 520; // 520ms smooth arc

    function flightStep(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Quadratic bezier curve: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const t = progress;
      const invT = 1 - t;
      const curX = invT * invT * currentX + 2 * invT * t * midX + t * t * targetX;
      const curY = invT * invT * currentY + 2 * invT * t * midY + t * t * targetY;

      // 3D perspective scale: shrink slightly as it goes into distance
      const scale = 1.05 - t * 0.42; // 1.05 down to 0.63
      const rotation = (1 - t) * -14 + t * 6;

      flyer.style.transform = `translate(${curX - currentX}px, ${curY - currentY}px) scale(${scale}) rotate(${rotation}deg)`;

      // Particle emission along flight path
      if (Math.random() < 0.45) {
        emitParticles(curX - stageRect.left, curY - stageRect.top, 1, 1, '#ff6b4a', 2.5);
      }

      if (progress < 1) {
        requestAnimationFrame(flightStep);
      } else {
        // Impact at rim / Swish through net!
        triggerSwish(flyer, card);
      }
    }

    requestAnimationFrame(flightStep);
  }

  function triggerSwish(flyer, originalCard) {
    const hoopRect = hoopEl.getBoundingClientRect();
    const stageRect = document.getElementById('stage').getBoundingClientRect();
    const netCenterX = (hoopRect.left + hoopRect.width / 2) - stageRect.left;
    const netCenterY = (hoopRect.top + 50) - stageRect.top;

    // 1. RIM BOUNCE 1 (Upper Bounce on Rim): Pops up off rim with bank hit
    window.sounds.playBackboard();
    emitParticles(netCenterX - 25, netCenterY - 15, 8, 2.5, '#ff5733', 2.5);

    flyer.style.transition = 'transform 0.22s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
    flyer.style.transform += ' translate(8px, -42px) rotate(8deg)';

    setTimeout(() => {
      // 2. RIM BOUNCE 2 (Soft Rim Tap above net): Centers over hoop
      window.sounds.playBounce(0.3);
      emitParticles(netCenterX + 15, netCenterY - 10, 6, 2.0, '#cbd3e1', 2.0);

      flyer.style.transition = 'transform 0.18s ease-in-out';
      flyer.style.transform += ' translate(6px, 22px) rotate(-4deg)';

      setTimeout(() => {
        // 3. SWISH THROUGH NET & DISSOLVE (Clean absorption into basket)
        window.sounds.playSwish();

        // Net ripple & stretch animation
        hoopEl.classList.remove('swish');
        void hoopEl.offsetWidth; // trigger reflow
        hoopEl.classList.add('swish');

        // Burst particles around net
        emitParticles(netCenterX, netCenterY, 16, 3.5, '#cbd3e1', 2.5);
        emitParticles(netCenterX, netCenterY, 10, 3.0, '#ff5733', 3.0);

        // Drops into net mesh, shrinks, and fades out cleanly (NEVER goes to floor!)
        flyer.style.transition = 'transform 0.38s cubic-bezier(0.25, 0.7, 0.3, 1), opacity 0.32s ease-out';
        flyer.style.transform += ' translateY(70px) scale(0.35)';
        flyer.style.opacity = '0';

        setTimeout(() => {
          flyer.remove();
          if (originalCard && originalCard.parentNode) {
            originalCard.remove();
          }

          // 4. Update Uploaded Counter
          incrementCounter();

          // 5. Spawn bottom upload progress card
          const fileName = originalCard.dataset.name || 'final fileeeee';
          const fileSize = originalCard.dataset.size || '2.4 MB';
          addUploadShelfItem(fileName, fileSize);

          // 6. Auto-spawn fresh shootable file on the court
          setTimeout(() => {
            if (!shootingCourtEl.querySelector('.shootable-file')) {
              const sampleFiles = [
                { name: 'final fileeeee', size: '2.4 MB', ext: 'pdf' },
                { name: 'presentation_deck', size: '5.1 MB', ext: 'pdf' },
                { name: 'hero_image_raw', size: '3.6 MB', ext: 'png' }
              ];
              const next = sampleFiles[uploadCount % sampleFiles.length];
              const nextCard = createShootableCard(next.name, next.size, next.ext);
              shootingCourtEl.appendChild(nextCard);
              initDraggableCard(nextCard);
            }
          }, 350);
        }, 360);
      }, 190);
    }, 220);
  }

  // --- Score Counter ---
  function incrementCounter() {
    uploadCount++;
    countValueEl.textContent = uploadCount;
    counterBadgeEl.classList.add('bump');
    setTimeout(() => {
      counterBadgeEl.classList.remove('bump');
    }, 300);
  }

  // --- Bottom Upload Shelf Card (Matching Reel 00:05 and 00:06) ---
  function addUploadShelfItem(name, size) {
    const itemCard = document.createElement('div');
    itemCard.className = 'upload-item-card';

    itemCard.innerHTML = `
      <div class="upload-file-mini-icon">PDF</div>
      <div class="upload-info">
        <div class="upload-name">${escapeHtml(name)}</div>
        <div class="upload-meta">${escapeHtml(size)}</div>
      </div>
      <div class="upload-right-group">
        <div class="upload-status-wrap">
          <span class="upload-status-text">Uploading...</span>
          <div class="progress-track">
            <div class="progress-fill"></div>
          </div>
        </div>
        <div class="check-container" style="display: none;">
          <div class="check-icon-circle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
        <button class="upload-card-dismiss" title="Dismiss" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    uploadShelfEl.prepend(itemCard);

    // Keep shelf tidy: max 2 items at a time
    if (uploadShelfEl.children.length > 2) {
      const oldest = uploadShelfEl.lastElementChild;
      oldest.style.opacity = '0';
      oldest.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => oldest.remove(), 250);
    }

    // Dismiss button click handler
    const dismissBtn = itemCard.querySelector('.upload-card-dismiss');
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      itemCard.style.opacity = '0';
      itemCard.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => itemCard.remove(), 250);
    });

    const statusText = itemCard.querySelector('.upload-status-text');
    const progressFill = itemCard.querySelector('.progress-fill');
    const checkContainer = itemCard.querySelector('.check-container');

    // Simulate upload progress bar (0% -> 100%)
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 14 + Math.random() * 16;
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(interval);

        // Turn green, update status text, and show checkmark
        progressFill.style.width = '100%';
        progressFill.classList.add('completed');
        statusText.classList.add('completed');
        statusText.textContent = 'Uploaded';

        checkContainer.style.display = 'block';

        // Play chime sound
        window.sounds.playSuccess();

        // Auto-dismiss after 7 seconds to keep view clear
        setTimeout(() => {
          if (itemCard && itemCard.parentNode) {
            itemCard.style.opacity = '0';
            itemCard.style.transform = 'translateY(10px) scale(0.95)';
            setTimeout(() => itemCard.remove(), 250);
          }
        }, 7000);
      } else {
        progressFill.style.width = `${currentProgress}%`;
      }
    }, 110);
  }

  // --- Setup Initial Sample Card ---
  const sampleCard = document.getElementById('sample-file');
  if (sampleCard) {
    initDraggableCard(sampleCard);
  }

  // --- Drop Zone Click & Native File Drag & Drop ---
  dropZoneEl.addEventListener('click', () => {
    fileInputEl.click();
  });

  fileInputEl.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  });

  // Native desktop drag events on drop-zone
  ;['dragenter', 'dragover'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZoneEl.classList.add('drag-active');
    });
  });

  ;['dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZoneEl.classList.remove('drag-active');
    });
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  });

  function handleFiles(files) {
    files.forEach((file, index) => {
      setTimeout(() => {
        const fileCard = createShootableCard(file.name, formatBytes(file.size), getExtension(file.name));
        shootingCourtEl.appendChild(fileCard);
        initDraggableCard(fileCard);

        // Auto-shoot directly into the hoop for dropped files!
        const rect = fileCard.getBoundingClientRect();
        shootIntoHoop(fileCard, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }, index * 240);
    });
  }

  function createShootableCard(name, size, ext) {
    const card = document.createElement('div');
    card.className = 'shootable-file';
    card.dataset.name = name;
    card.dataset.size = size;
    card.dataset.type = ext;

    const badgeText = ext.toUpperCase().slice(0, 4) || 'FILE';

    card.innerHTML = `
      <div class="file-icon-card">
        <div class="file-corner-fold"></div>
        <div class="pdf-tag" style="background:${getExtColor(ext)}">${escapeHtml(badgeText)}</div>
        <div class="file-lines">
          <div class="line l1"></div>
          <div class="line l2"></div>
          <div class="line l3"></div>
        </div>
      </div>
      <span class="file-label">${escapeHtml(name)}</span>
    `;

    return card;
  }

  // --- Buttons: New File & Reset ---
  newBallBtn.addEventListener('click', () => {
    const existing = shootingCourtEl.querySelector('.shootable-file');
    if (existing) {
      existing.remove();
    }
    const sampleFiles = [
      { name: 'final fileeeee', size: '2.4 MB', ext: 'pdf' },
      { name: 'project_v2_final', size: '1.8 MB', ext: 'pdf' },
      { name: 'design_mockup', size: '4.1 MB', ext: 'png' },
      { name: 'contract_signed', size: '840 KB', ext: 'pdf' }
    ];
    const item = sampleFiles[uploadCount % sampleFiles.length];
    const newCard = createShootableCard(item.name, item.size, item.ext);
    shootingCourtEl.appendChild(newCard);
    initDraggableCard(newCard);
  });

  resetBtn.addEventListener('click', () => {
    uploadCount = 0;
    countValueEl.textContent = '0';
    uploadShelfEl.innerHTML = '';
    const existing = shootingCourtEl.querySelector('.shootable-file');
    if (!existing) {
      const initial = createShootableCard('final fileeeee', '2.4 MB', 'pdf');
      shootingCourtEl.appendChild(initial);
      initDraggableCard(initial);
    }
  });

  // Sound toggle button
  soundBtn.addEventListener('click', () => {
    const isOn = window.sounds.toggleSound();
    const onIcon = soundBtn.querySelector('.sound-on-icon');
    const offIcon = soundBtn.querySelector('.sound-off-icon');
    if (isOn) {
      onIcon.style.display = 'block';
      offIcon.style.display = 'none';
      soundBtn.style.color = '';
    } else {
      onIcon.style.display = 'none';
      offIcon.style.display = 'block';
      soundBtn.style.color = '#ff5733';
    }
  });

  // --- Utilities ---
  function getExtension(filename) {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase() || 'file';
  }

  function getExtColor(ext) {
    switch (ext) {
      case 'pdf': return '#ff3b30';
      case 'png':
      case 'jpg':
      case 'jpeg': return '#34c759';
      case 'zip': return '#ff9500';
      case 'js':
      case 'ts': return '#5856d6';
      default: return '#ff5733';
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
});
