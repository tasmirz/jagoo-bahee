const doc = { _id: "1", toJSON: () => ({_id: "1", big: 1n}), date: new Date() };
console.log(typeof doc.date, doc.date instanceof Date);
