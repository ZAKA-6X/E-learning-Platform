async function loadMatieres() {
  console.log('Loading matieres...');
  const token = localStorage.getItem('token');

  try {
    const res = await fetch('/api/admin/matieres', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error('Failed to fetch matieres:', res.status);
      return;
    }

    const matieres = await res.json();

    const matiereList = document.getElementById('matiere-list');
    matieres.forEach((matiere) => {
      const listItem = document.createElement('li');
      listItem.textContent = matiere.name;
      matiereList.appendChild(listItem);
    });
  } catch (error) {
    console.error('Error loading matieres:', error);
  }
}

document.addEventListener('DOMContentLoaded', loadMatieres);
