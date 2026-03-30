-- CreateTable
CREATE TABLE "user_login_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" UUID NOT NULL,
    "logged_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logged_out_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "user_login_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_login_sessions_session_id_key" ON "user_login_sessions"("session_id");

-- CreateIndex
CREATE INDEX "user_login_sessions_user_id_idx" ON "user_login_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_login_sessions_logged_in_at_idx" ON "user_login_sessions"("logged_in_at" DESC);

-- AddForeignKey
ALTER TABLE "user_login_sessions" ADD CONSTRAINT "user_login_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
