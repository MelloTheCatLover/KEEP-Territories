-- Admins drive the field via the "play as team" selector and are never team
-- members. Detach any admin that lingered in a team from the old join/leave
-- workaround. Teams own sectors independently of user membership, so clearing
-- an admin's membership does not affect captures or team stats.

UPDATE users
   SET team_id = NULL,
       team_role = NULL
 WHERE role = 'admin'
   AND team_id IS NOT NULL;
