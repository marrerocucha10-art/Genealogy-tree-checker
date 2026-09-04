const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const form = document.getElementById('photoToLifeForm');
const photoInput = document.getElementById('memoryPhoto');
const statusMessage = document.getElementById('photoToLifeStatus');
const submitButton = document.getElementById('createMemoryVideo');
const resultSection = document.getElementById('photoToLifeResult');
const memoryVideo = document.getElementById('memoryVideo');
const downloadLink = document.getElementById('downloadMemoryVideo');

function setStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function readPhotoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected photo could not be read.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function getPredictionResult(predictionId) {
  const response = await fetch(`/api/photo-to-life/${encodeURIComponent(predictionId)}`);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'Could not check the memory video status.');
  return result.prediction;
}

async function waitForPrediction(predictionId) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const prediction = await getPredictionResult(predictionId);
    if (prediction.status === 'succeeded') return prediction.output;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error || 'The memory video could not be created.');
    }
    setStatus('Your memory video is being created. This can take a few minutes...', 'info');
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error('The memory video is taking longer than expected. Please check back shortly.');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const photo = photoInput.files[0];
  if (!photo) return;
  if (photo.size > MAX_PHOTO_BYTES) {
    setStatus('Choose a photo smaller than 10 MB.', 'error');
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
    setStatus('Choose a JPG, PNG, or WebP photo.', 'error');
    return;
  }

  submitButton.disabled = true;
  resultSection.hidden = true;
  setStatus('Preparing your authorized photo...', 'info');
  try {
    const photoDataUrl = await readPhotoAsDataUrl(photo);
    const motion = form.elements.motion.value;
    const response = await fetch('/api/photo-to-life', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: photoDataUrl,
        motion,
        hasPermission: document.getElementById('photoPermission').checked,
        acceptsAiLabel: document.getElementById('aiDisclosure').checked,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not start the memory video.');

    const output = await waitForPrediction(result.prediction.id);
    const videoUrl = Array.isArray(output) ? output[0] : output;
    if (!videoUrl) throw new Error('The memory video was created without a downloadable video file.');
    memoryVideo.src = videoUrl;
    downloadLink.href = videoUrl;
    resultSection.hidden = false;
    setStatus('Your AI-generated memory video is ready.', 'success');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(error.message || 'Could not create the memory video.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});
