
-- Fix party for all legislators where it's publicly known
UPDATE legislator_contacts SET party = 'Democratic' WHERE name IN (
  'Raúl Grijalva','Barbara Lee','Eric Swalwell','Katie Porter','Maxine Waters',
  'Mike Thompson','Jon Ossoff','Andy Levin','Rashida Tlaib','Cory Booker',
  'Ben Ray Luján','Alexandria Ocasio-Cortez','Chuck Schumer','Brendan Boyle',
  'Bernie Sanders','Patty Murray','Rebecca Saldaña','Claire Wilson',
  'Jesse Harris','Mona Das'
);

UPDATE legislator_contacts SET party = 'Republican' WHERE name IN (
  'Darrell Issa','Tom Cole','Jesse Young'
);

-- Bernie Sanders is technically Independent but caucuses Democratic
UPDATE legislator_contacts SET party = 'Independent' WHERE name = 'Bernie Sanders';
