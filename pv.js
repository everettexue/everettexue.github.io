const r = document.documentElement.style;
const qs = id => document.getElementById(id);


function update() {
r.setProperty('--cell', qs('cell').value + 'px');
r.setProperty('--thick-step', qs('step').value);
r.setProperty('--thin-w', qs('thin').value + 'px');
r.setProperty('--thick-w', qs('thick').value + 'px');


qs('cellVal').textContent = qs('cell').value;
qs('stepVal').textContent = qs('step').value;
qs('thinVal').textContent = qs('thin').value;
qs('thickVal').textContent = qs('thick').value;
}


['cell','step','thin','thick'].forEach(id => qs(id).addEventListener('input', update));
update();
