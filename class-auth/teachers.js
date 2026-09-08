const TEACHERS = Object.freeze([
  { id: 'chi', name: '语文老师', role: 'teacher' },
  { id: 'mat', name: '数学老师', role: 'teacher' },
  { id: 'eng', name: '英语老师', role: 'teacher' },
  { id: 'sci', name: '科学老师', role: 'teacher' },
  { id: 'com', name: '社会老师', role: 'teacher' },
  { id: 'tec', name: '副科老师', role: 'teacher' }
].map(Object.freeze));
module.exports = { TEACHERS };
