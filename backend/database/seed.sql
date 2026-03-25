INSERT OR IGNORE INTO branches (branch_name) VALUES
('CSE'),
('ISE'),
('ECE'),
('AIML');

INSERT OR IGNORE INTO colleges (college_name, location, ranking, average_package) VALUES
('RV College of Engineering', 'Bengaluru', 1, 18.5),
('BMS College of Engineering', 'Bengaluru', 2, 13.2),
('PES University', 'Bengaluru', 3, 16.1),
('MS Ramaiah Institute of Technology', 'Bengaluru', 4, 12.8),
('Dayananda Sagar College of Engineering', 'Bengaluru', 5, 8.6),
('CMR Institute of Technology', 'Bengaluru', 6, 7.2),
('Nitte Meenakshi Institute of Technology', 'Bengaluru', 7, 7.8),
('New Horizon College of Engineering', 'Bengaluru', 8, 6.9);

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'GM', 2024, 1200
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'RV College of Engineering' AND b.branch_name = 'CSE';

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'OBC', 2024, 1800
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'RV College of Engineering' AND b.branch_name = 'CSE';

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'SC/ST', 2024, 4500
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'RV College of Engineering' AND b.branch_name = 'CSE';

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'GM', 2023, 1120
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'RV College of Engineering' AND b.branch_name = 'CSE';

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'GM', 2024, 2200
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'BMS College of Engineering' AND b.branch_name = 'ISE';

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'GM', 2024, 4200
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'PES University' AND b.branch_name = 'ECE';

INSERT OR IGNORE INTO cutoffs (college_id, branch_id, category, year, cutoff_rank)
SELECT c.id, b.id, 'GM', 2024, 5100
FROM colleges c CROSS JOIN branches b
WHERE c.college_name = 'MS Ramaiah Institute of Technology' AND b.branch_name = 'AIML';

INSERT OR IGNORE INTO users (name, email, password)
VALUES ('Demo User', 'demo@kcetcompass.com', 'demo_password_hash');

INSERT OR IGNORE INTO analytics (branch_id, average_salary, placement_percentage)
SELECT id, 14.2, 92.5 FROM branches WHERE branch_name = 'CSE';

INSERT OR IGNORE INTO analytics (branch_id, average_salary, placement_percentage)
SELECT id, 11.8, 89.1 FROM branches WHERE branch_name = 'ISE';

INSERT OR IGNORE INTO analytics (branch_id, average_salary, placement_percentage)
SELECT id, 10.7, 85.4 FROM branches WHERE branch_name = 'ECE';

INSERT OR IGNORE INTO analytics (branch_id, average_salary, placement_percentage)
SELECT id, 12.9, 88.8 FROM branches WHERE branch_name = 'AIML';
