(function () {
  const TOAST_TIMEOUT = 4000;

  function ensureContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function toast({ message, type = 'info', duration = TOAST_TIMEOUT } = {}) {
    if (!message) return;
    const container = ensureContainer();
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    toastEl.setAttribute('role', 'status');

    const text = document.createElement('div');
    text.className = 'toast-message';
    text.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';

    function removeToast() {
      if (!toastEl.parentNode) return;
      toastEl.classList.remove('toast-show');
      toastEl.addEventListener('transitionend', () => {
        toastEl.remove();
      }, { once: true });
      toastEl.remove();
    }

    closeBtn.addEventListener('click', removeToast);

    toastEl.appendChild(text);
    toastEl.appendChild(closeBtn);
    container.appendChild(toastEl);

    requestAnimationFrame(() => {
      toastEl.classList.add('toast-show');
    });

    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
    return removeToast;
  }

  function confirm({ title = 'Confirmation', message = '', confirmText = 'Confirmer', cancelText = 'Annuler' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.tabIndex = -1;

      const modal = document.createElement('div');
      modal.className = 'modal';

      const h3 = document.createElement('div');
      h3.className = 'modal-title';
      h3.textContent = title;

      const body = document.createElement('div');
      body.className = 'modal-body';
      body.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'is-muted';
      cancelBtn.textContent = cancelText;

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'is-primary';
      confirmBtn.textContent = confirmText;

      const handler = function (e) {
        if (e.key === 'Escape') {
          cleanup(false);
        }
      };

      function cleanup(result) {
        overlay.remove();
        document.removeEventListener('keydown', handler);
        resolve(result);
      }

      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      document.addEventListener('keydown', handler);

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      modal.appendChild(h3);
      modal.appendChild(body);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      confirmBtn.focus();
    });
  }

  window.notify = {
    toast,
    confirm,
  };
})();
