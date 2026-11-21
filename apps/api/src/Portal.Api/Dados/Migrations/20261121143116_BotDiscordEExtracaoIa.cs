using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class BotDiscordEExtracaoIa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "autor",
                table: "bugs",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "mensagem_externa_id",
                table: "bugs",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "configuracoes_discord",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_criptografado = table.Column<string>(type: "text", nullable: false),
                    final_token = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    canal_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ultima_mensagem_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    configurado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ultima_leitura = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ultimo_erro = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configuracoes_discord", x => x.id);
                    table.ForeignKey(
                        name: "FK_configuracoes_discord_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "configuracoes_ia",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provedor = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    chave_criptografada = table.Column<string>(type: "text", nullable: false),
                    configurado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configuracoes_ia", x => x.id);
                    table.ForeignKey(
                        name: "FK_configuracoes_ia_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sugestoes_ia",
                columns: table => new
                {
                    bug_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    tentativas = table.Column<int>(type: "integer", nullable: false),
                    proxima_tentativa_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    passos = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    esperado = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    obtido = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ambiente = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    severidade = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    area = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    confianca = table.Column<int>(type: "integer", nullable: true),
                    evidencias = table.Column<string[]>(type: "text[]", nullable: false),
                    erro = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    criado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    atualizado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sugestoes_ia", x => x.bug_id);
                    table.ForeignKey(
                        name: "FK_sugestoes_ia_bugs_bug_id",
                        column: x => x.bug_id,
                        principalTable: "bugs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_sugestoes_ia_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bugs_workspace_id_mensagem_externa_id",
                table: "bugs",
                columns: new[] { "workspace_id", "mensagem_externa_id" },
                unique: true,
                filter: "mensagem_externa_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_configuracoes_discord_workspace_id",
                table: "configuracoes_discord",
                column: "workspace_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_configuracoes_ia_workspace_id",
                table: "configuracoes_ia",
                column: "workspace_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_sugestoes_ia_status_proxima_tentativa_em",
                table: "sugestoes_ia",
                columns: new[] { "status", "proxima_tentativa_em" });

            migrationBuilder.CreateIndex(
                name: "IX_sugestoes_ia_workspace_id",
                table: "sugestoes_ia",
                column: "workspace_id");

            // Mesma regra da auditoria 20/11: toda tabela do schema public com RLS ligado.
            migrationBuilder.Sql("ALTER TABLE public.configuracoes_discord ENABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql("ALTER TABLE public.configuracoes_ia ENABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql("ALTER TABLE public.sugestoes_ia ENABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "configuracoes_discord");

            migrationBuilder.DropTable(
                name: "configuracoes_ia");

            migrationBuilder.DropTable(
                name: "sugestoes_ia");

            migrationBuilder.DropIndex(
                name: "IX_bugs_workspace_id_mensagem_externa_id",
                table: "bugs");

            migrationBuilder.DropColumn(
                name: "autor",
                table: "bugs");

            migrationBuilder.DropColumn(
                name: "mensagem_externa_id",
                table: "bugs");
        }
    }
}
