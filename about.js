document.addEventListener("DOMContentLoaded", () => {
  const bmcContainer = document.getElementById("bmc-container");
  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = "https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js";
  script.dataset.name = "bmc-button";
  script.dataset.slug = "lamhizz";
  script.dataset.color = "#FFDD00";
  script.dataset.emoji = "☕";
  script.dataset.font = "Arial";
  script.dataset.text = "Buy me a coffee";
  script.dataset.outlineColor = "#000000";
  script.dataset.fontColor = "#000000";
  script.dataset.coffeeColor = "#ffffff";
  bmcContainer.appendChild(script);
});
