CREATE TABLE IF NOT EXISTS `business_baselines` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `entity_type` enum('product','expense_category') NOT NULL,
  `entity_id` varchar(255) NOT NULL,
  `avg_amount` decimal(10,2) NOT NULL,
  `stddev_amount` decimal(10,2),
  `sample_count` int NOT NULL,
  `last_updated` bigint NOT NULL,
  UNIQUE KEY `idx_entity_type_id` (`entity_type`,`entity_id`),
  KEY `idx_entity_type` (`entity_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
